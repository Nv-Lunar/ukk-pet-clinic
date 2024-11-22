from odoo import models, fields, api

class PetCategory(models.Model):
    _name = 'pet_category.pet_category'
    _description = 'Master Data Pet Kategori'

    name = fields.Char(string='Name', required=True)
    rate = fields.Float(string='Rate', required=True, help='Faktor waktu pengerjaan untuk kategori hewan ini')


class Dokter(models.Model):
    _name = 'dokter.dokter'
    _description = 'Dokter Pet Clinic'

    name = fields.Char(string='Nama Dokter', required=True)
    specialty = fields.Char(string='Spesialisasi')
    phone = fields.Char(string='Nomor Telepon')




class Service(models.Model):
    _name = 'service.service'
    _description = 'Master Data Service'

    name = fields.Char(string="Nama Layanan", required=True)
    price_service = fields.Integer(string="Harga", required=True)
    avg_time = fields.Integer(string="Waktu Rata-rata (Menit)")