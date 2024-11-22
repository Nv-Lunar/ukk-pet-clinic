from odoo import models, fields, api
import logging

from odoo.exceptions import ValidationError
_logger = logging.getLogger(__name__)


class PetClinic(models.Model):
    _name = 'pet_clinic.pet_clinic'
    _description = 'Pet Clinic'
    _rec_name = 'pet_name'

    pet_id = fields.Char(string="ID Peliharaan", readonly=True, unique=True)
    pet_name = fields.Char(string="Nama Hewan", required=True)
    pet_type = fields.Many2one('pet_category.pet_category', ondelete='cascade')
    pet_age = fields.Integer(string="Umur Hewan")
    owner = fields.Many2one('res.partner', string='Owner', required=True)

    @api.model
    def _get_next_pet_id(self):
        # Cari record terakhir untuk menentukan ID berikutnya
        last_record = self.search([], order='id desc', limit=1)
        if last_record and last_record.pet_id:
            try:
                last_id = int(last_record.pet_id.split('_')[1])  # Ambil angka terakhir
            except ValueError:
                raise ValidationError(_("Format pet_id tidak valid pada record terakhir."))
            next_id = last_id + 1
        else:
            next_id = 1  # Jika tidak ada record, mulai dari 1
        return f"PET_{next_id:06d}"  # Format ID menjadi PET_000001, PET_000002, dst.

    @api.model
    def create(self, vals):
        # Generate pet_id secara otomatis
        vals['pet_id'] = self._get_next_pet_id()

        # Pastikan pet_id tidak duplikat
        if self.search([('pet_id', '=', vals['pet_id'])]):
            raise ValidationError(_("Data dengan ID '%s' sudah ada.") % vals['pet_id'])

        return super(PetClinic, self).create(vals)

    def write(self, vals):
        if 'pet_id' in vals:
            raise ValidationError(_("Anda tidak dapat mengubah ID Peliharaan secara manual."))
        return super(PetClinic, self).write(vals)

    def name_get(self):
        result = []
        for record in self:
            name = f"{record.pet_name} ({record.owner.name})"
            result.append((record.id, name))
        return result

    _sql_constraints = [
        ('unique_pet_id', 'unique(pet_id)', "ID Peliharaan harus unik.")
    ]



