from odoo import models, fields, api
from datetime import timedelta
import logging
from odoo.exceptions import ValidationError

_logger = logging.getLogger(__name__)

class ClientClinic(models.Model):
    _name = 'client_clinic.client_clinic'
    _description = 'Client Clinic'

    name = fields.Char(string="Booking ID", readonly=True, default=lambda self: self._get_next_booking_id())
    customer_id = fields.Many2one('res.partner', string="Customer", required=True)
    phone = fields.Char(related='customer_id.phone', string="Nomor Telepon", readonly=True)
    address = fields.Char(related='customer_id.contact_address', string="Alamat", readonly=True)
    email = fields.Char(related='customer_id.email', string="Email", readonly=True)
    booking_date = fields.Date(string="Tanggal Booking", required=True)

    pet_service_lines = fields.One2many('client_clinic.line', 'client_clinic_id', string="Peliharaan dan Layanan")
    product_line_ids = fields.One2many('client_clinic.product_line', 'client_clinic_id', string="Product Lines")

    jam_antar = fields.Datetime(string="Jam Antar", required=True)
    jam_selesai = fields.Datetime(string="Jam Selesai", compute="_compute_jam_selesai", store=True)
    worker_id = fields.Many2one('dokter.dokter', string="Dokter", required=True)

    total_time = fields.Integer(string="Total Waktu (Menit)", compute="_compute_total_time", store=True)
    total_price = fields.Integer(string="Total Harga", compute="_compute_total_price", store=True)
    description = fields.Text()

    state = fields.Selection([ 
        ('cancel', 'Cancel'), 
        ('booking', 'Booking'), 
        ('not paid', 'Not Paid'), 
        ('paid', 'Paid')  
    ], string="Status", default='booking', readonly=True)

    # payment_lines = fields.One2many('account.payment.line', 'client_clinic_id', string="Payment Lines")


    payment_date = fields.Date(string="Tanggal Pembayaran", default=fields.Date.today) 
    payment_method_id = fields.Many2one('account.journal', string="Metode Pembayaran") 
    # Ubah field payment_amount
    payment_amount = fields.Integer(string="Jumlah Pembayaran", compute="_compute_payment_amount", store=True)

    # Tambahkan metode compute
    @api.depends('total_price')
    def _compute_payment_amount(self):
        for record in self:
            record.payment_amount = record.total_price
            
 



    def action_cancel(self): 
        return self.write({"state": "cancel"}) 

    invoice_id = fields.Many2one('account.payment', string="Invoice", readonly=True)

    def action_done(self):
        """Mark the booking as done and create a payment record."""
        for record in self:
            if record.state == 'not paid':
                raise ValidationError("This booking is already recorded.")
            if record.payment_amount <= 0:
                raise ValidationError("Payment amount should be greater than zero.")

            record.write({
                'state': 'not paid',
                'payment_date': fields.Date.today(),
            })

            # Create a payment record
            self.env['account.payment'].create({
                'partner_id': record.customer_id.id,
                'amount': record.payment_amount,
                'payment_type': 'inbound',
                'date': fields.Date.today(),
                'name': f"Payment-{record.id}",
                'journal_id': False, 
                # Include any additional fields needed
            })

    def action_pay(self):
        """Mark the booking as paid, validate, confirm the invoice, and update the journal and date."""
        for record in self:
            # Validation checks
            if record.state == 'paid':
                raise ValidationError("This booking is already paid.")
            if record.payment_amount <= 0:
                raise ValidationError("Payment amount should be greater than zero.")
            if not record.payment_method_id:
                raise ValidationError("Please select a payment method.")

            # Confirm the invoice if it exists
            if record.invoice_id:
                record.invoice_id.action_post()  # Confirm the invoice

            # Update the state and payment date
            record.write({
                'state': 'paid',  # Update the state to 'paid'
                'payment_date': fields.Date.today(),  # Update the payment date
            })

            # Find the existing payment record
            payment_record = self.env['account.payment'].search([
                ('partner_id', '=', record.customer_id.id),
                ('amount', '=', record.payment_amount),
                ('payment_type', '=', 'inbound'),
                ('state', '!=', 'cancelled'),
                ('name', '=', f"Payment-{record.id}"),
            ], limit=1)

            if payment_record:
                
                if payment_record.state == 'draft':
                    self.env.cr.execute("""
                        UPDATE account_move
                        SET journal_id = %s
                        WHERE id = %s
                    """, (record.payment_method_id.id, payment_record.move_id.id))
                    payment_record.action_post()  # Pastikan untuk memposting pembayaran jika masih dalam draft
            else:
                # Create a new payment record if it doesn't exist
                payment_record = self.env['account.payment'].create({
                    'partner_id': record.customer_id.id,
                    'amount': record.payment_amount,
                    'payment_type': 'inbound',
                    'date': fields.Date.today(),
                    'name': f"Payment-{record.id}",
                    'journal_id': record.payment_method_id.id,  # Set journal if newly created
                })
                payment_record.action_post()  # Post the payment after creation

    def write(self, vals): 
        # Prevent editing if the state is not 'booking' 
        if self.state in ['paid', 'cancel']:
            raise ValueError("Booking cannot be edited once it is completed or canceled.")
    
        # Set Booking ID if not already set
        if not self.name:  # If name is not present (not saved yet)
            vals['name'] = self._get_next_booking_id()  # Set new Booking ID

        res = super(ClientClinic, self).write(vals)

        # Update calendar event if necessary
        if 'jam_antar' in vals or 'jam_selesai' in vals:
            _logger.info(f"Updating booking {self.id}. Updating calendar event...")
            self._create_calendar_event()  # Update or create calendar event

        return res

    @api.model
    def _get_next_booking_id(self):
        last_record = self.search([], order='id desc', limit=1)
        if last_record:
            last_id = int(last_record.name.split('_')[1])  # Get the last number
            next_id = last_id + 1
        else:
            next_id = 1  # Start from 1 if no record exists
        
        return f"CL_{next_id:06d}"

    def create(self, vals):
        record = super(ClientClinic, self).create(vals)
        _logger.info(f"Creating booking {record.id}. Creating calendar event...")
        record._create_calendar_event()  # Create calendar event after record is created
        return record

    def unlink(self):
        for record in self:
            events = self.env['calendar.event'].search([
                ('name', '=', f"{record.worker_id.name} | {record.name}"),
                ('start', '=', record.jam_antar),
                ('stop', '=', record.jam_selesai)
            ])
            events.unlink()  # Remove found calendar events
        return super(ClientClinic, self).unlink()

    @api.depends('pet_service_lines.real_time')
    def _compute_total_time(self):
        for record in self:
            record.total_time = sum(line.real_time for line in record.pet_service_lines)

    @api.depends('jam_antar', 'total_time')
    def _compute_jam_selesai(self):
        for record in self:
            if record.jam_antar and record.total_time:
                record.jam_selesai = record.jam_antar + timedelta(minutes=record.total_time)
            else:
                record.jam_selesai = False

    @api.depends('pet_service_lines.real_price', 'product_line_ids.total_price')
    def _compute_total_price(self):
        for record in self:
            total_price = sum(line.real_price for line in record.pet_service_lines)
            total_price += sum(line.total_price for line in record.product_line_ids)
            record.total_price = total_price

    @api.onchange('customer_id')
    def _onchange_customer_id(self):
        if self.customer_id:
            pet_domain = [('owner', '=', self.customer_id.id)]
            pets = self.env['pet_clinic.pet_clinic'].search(pet_domain)
            self.pet_service_lines = [(5, 0, 0)]  # Clear existing lines
            for pet in pets:
                self.pet_service_lines |= self.env['client_clinic.line'].new({'pet_id': pet.id, 'service_id': False})
        else:
            self.pet_service_lines = [(5, 0, 0)]  # Reset if no customer

    def _create_calendar_event(self):
        if self.jam_antar and self.jam_selesai:
            subject = f"{self.worker_id.name} | {self.name}"
            event_values = {
                'name': subject,
                'start': self.jam_antar,
                'stop': self.jam_selesai,
                'user_id': getattr(self.worker_id, 'user_id', False),
                'allday': False,
            }
            _logger.info("Creating calendar event with values: %s", event_values)
            self.env['calendar.event'].create(event_values)

    @api.constrains('booking_date', 'jam_antar', 'worker_id', 'pet_service_lines', 'customer_id')
    def _check_worker_availability(self):
        """Check if the worker is already booked at that time"""
        for booking in self:
            if not booking.pet_service_lines:
                raise ValidationError("Silakan pilih peliharaan dan layanan sebelum menyimpan.")
            for line in booking.pet_service_lines:
                if line.pet_id.owner != booking.customer_id:
                    raise ValidationError("Anda tidak dapat memesan untuk peliharaan yang bukan milik Anda.")
            overlapping_bookings = self.env['client_clinic.client_clinic'].search([
                ('booking_date', '=', booking.booking_date),
                ('worker_id', '=', booking.worker_id.id),
                ('id', '!=', booking.id),
                ('jam_antar', '<', booking.jam_selesai),
                ('jam_selesai', '>', booking.jam_antar)
            ])
            if overlapping_bookings:
                raise ValidationError(f"Pekerja {booking.worker_id.name} sudah dipesan pada jam tersebut. Silakan pilih jam atau pekerja lain.")

class ClientClinicLine(models.Model):
    _name = 'client_clinic.line'
    _description = 'Layanan untuk Setiap Peliharaan'

    client_clinic_id = fields.Many2one('client_clinic.client_clinic', string="Booking", ondelete='cascade')
    pet_id = fields.Many2one('pet_clinic.pet_clinic', string="Peliharaan", required=True)
    service_id = fields.Many2one('service.service', string="Layanan", required=True)
    price_service = fields.Integer(related='service_id.price_service', string="Harga Layanan", readonly=True)
    avg_time = fields.Integer(related='service_id.avg_time', string="Waktu Layanan (Menit)", readonly=True)

    real_price = fields.Integer(string="Harga Real", compute="_compute_real_price", store=True)
    real_time = fields.Integer(string="Waktu Real (Menit)", compute="_compute_real_time", store=True)
    rate = fields.Float(related='pet_id.pet_type.rate', string="Rate", readonly=True)


    
    @api.depends('service_id', 'pet_id')
    def _compute_real_price(self):
        for line in self:
            if line.pet_id and line.pet_id.pet_type:
                line.real_price = line.price_service * line.pet_id.pet_type.rate
                _logger.debug(f"Computed real price for line {line.id}: {line.real_price}")
            else:
                line.real_price = 0.0
                _logger.warning(f"Could not compute real price for line {line.id}. Missing pet or pet type.")

    @api.depends('avg_time', 'pet_id')
    def _compute_real_time(self):
        for line in self:
            if line.pet_id and line.pet_id.pet_type:
                line.real_time = line.avg_time * line.pet_id.pet_type.rate
                _logger.debug(f"Computed real time for line {line.id}: {line.real_time}")
            else:
                line.real_time = 0.0
                _logger.warning(f"Could not compute real time for line {line.id}. Missing pet or pet type.")



class ClientClinicProductLine(models.Model):
    _name = 'client_clinic.product_line'
    _description = 'Produk untuk Setiap Peliharaan'

    client_clinic_id = fields.Many2one('client_clinic.client_clinic', string="Booking", ondelete='cascade')
    pet_id = fields.Many2one('pet_clinic.pet_clinic', string="Peliharaan", required=True)
    product_id = fields.Many2one('product.product', string="Produk", required=True)
    product_name = fields.Char(related='product_id.name', string="Nama Produk")
    quantity = fields.Integer(string="Stok Tersedia", readonly=True, compute='_compute_quantity')
    quantity_selected = fields.Integer(string="Jumlah yang Dipilih")
    sales_price = fields.Float(related='product_id.lst_price', string="Harga Jual", readonly=True)
    total_price = fields.Integer(string="Total Harga", compute="_compute_total_price", store=True)

    @api.depends('quantity_selected', 'sales_price')
    def _compute_total_price(self):
        for line in self:
            line.total_price = line.quantity_selected * line.sales_price
            _logger.debug(f"Computed total price for product line {line.id}: {line.total_price}")

    @api.depends('product_id')
    def _compute_quantity(self):
        for line in self:
            if line.product_id:
                product = line.product_id.with_context({})
                line.quantity = product.qty_available
                _logger.info(f"Stok tersedia untuk produk {product.name}: {product.qty_available}")
            else:
                line.quantity = 0

    @api.onchange('quantity_selected')
    def _check_quantity_available(self):
        for line in self:
            if line.quantity_selected > line.quantity:
                raise ValidationError("Jumlah yang dipilih melebihi stok yang tersedia.")
            elif line.quantity_selected < 0:
                raise ValidationError("Jumlah yang dipilih tidak boleh negatif.")

    @api.model
    def create(self, vals):
        record = super(ClientClinicProductLine, self).create(vals)
        if record.quantity_selected > 0:
            # Membuat stock picking (pengiriman) tanpa 'move_lines' langsung
            picking = self.env['stock.picking'].create({
                'partner_id': record.client_clinic_id.customer_id.id,
                'location_id': self.env.ref('stock.stock_location_stock').id,
                'location_dest_id': self.env.ref('stock.stock_location_customers').id,
                'picking_type_id': self.env.ref('stock.picking_type_out').id,
            })

            # Membuat stock move yang terkait dengan picking
            stock_move = self.env['stock.move'].create({
                'name': f"Pengurangan stok untuk {record.product_name}",
                'product_id': record.product_id.id,
                'product_uom_qty': record.quantity_selected,
                'product_uom': record.product_id.uom_id.id,
                'picking_id': picking.id,
                'location_id': self.env.ref('stock.stock_location_stock').id,
                'location_dest_id': self.env.ref('stock.stock_location_customers').id,
            })

            # Konfirmasi, assign, dan validasi pergerakan stok
            stock_move._action_confirm()
            stock_move._action_assign()
            stock_move._action_done()

            # Konfirmasi dan validasi picking (pengiriman)
            picking.action_confirm()
            picking.action_assign()
            picking.button_validate()

        return record


    def write(self, vals):
        res = super(ClientClinicProductLine, self).write(vals)
        # Memperbarui stok jika ada perubahan quantity_selected
        self._create_stock_picking()
        return res

    def _create_stock_picking(self):
        """Membuat stock picking dan mengurangi stok secara otomatis."""
        picking_type = self.env.ref('stock.picking_type_out')  # Pengiriman ke pelanggan
        for line in self:
            if line.quantity_selected > 0:
                picking = self.env['stock.picking'].create({
                    'partner_id': line.client_clinic_id.customer_id.id,  # Pastikan ada partner
                    'picking_type_id': picking_type.id,
                    'location_id': self.env.ref('stock.stock_location_stock').id,  # Lokasi asal (gudang)
                    'location_dest_id': self.env.ref('stock.stock_location_customers').id,  # Lokasi tujuan (pelanggan)
                    'move_type': 'direct',
                })
                stock_move = self.env['stock.move'].create({
                    'name': f"Pengurangan stok untuk {line.product_name}",
                    'product_id': line.product_id.id,
                    'product_uom_qty': line.quantity_selected,
                    'product_uom': line.product_id.uom_id.id,
                    'picking_id': picking.id,
                    'location_id': self.env.ref('stock.stock_location_stock').id,
                    'location_dest_id': self.env.ref('stock.stock_location_customers').id,
                })
                stock_move._action_confirm()
                stock_move._action_assign()
                stock_move._action_done()  # Validasi pergerakan stok
                _logger.info(f"Stok produk {line.product_name} berkurang sebanyak {line.quantity_selected}")


