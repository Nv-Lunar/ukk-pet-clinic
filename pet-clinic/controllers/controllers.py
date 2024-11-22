# -*- coding: utf-8 -*-
# from odoo import http


# class Pet-clinic(http.Controller):
#     @http.route('/pet-clinic/pet-clinic', auth='public')
#     def index(self, **kw):
#         return "Hello, world"

#     @http.route('/pet-clinic/pet-clinic/objects', auth='public')
#     def list(self, **kw):
#         return http.request.render('pet-clinic.listing', {
#             'root': '/pet-clinic/pet-clinic',
#             'objects': http.request.env['pet-clinic.pet-clinic'].search([]),
#         })

#     @http.route('/pet-clinic/pet-clinic/objects/<model("pet-clinic.pet-clinic"):obj>', auth='public')
#     def object(self, obj, **kw):
#         return http.request.render('pet-clinic.object', {
#             'object': obj
#         })

