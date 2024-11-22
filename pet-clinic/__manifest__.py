# -*- coding: utf-8 -*-
{
    'name': "pet-clinic",

    'summary': "Short (1 phrase/line) summary of the module's purpose",

    'description': """
Long description of module's purpose
    """,

    'author': "My Company",
    'website': "https://www.yourcompany.com",

    # Categories can be used to filter modules in modules listing
    # Check https://github.com/odoo/odoo/blob/15.0/odoo/addons/base/data/ir_module_category_data.xml
    # for the full list
    'category': 'Uncategorized',
    'version': '0.1',

    # any module necessary for this one to work correctly
    'depends': ['base','calendar','account'],

    # always loaded
    'data': [
        'security/ir.model.access.csv',
        
        # Menu
        'views/clinic_actions.xml',
        'views/clinic_menus.xml',
        'views/pet_kategori_views.xml',
        'views/pet_clinic_views.xml',
        'views/service_views.xml',
        'views/dokter_views.xml',
        'views/client_clinic_views.xml',
        
        # 'views/views.xml',
        'views/templates.xml',
    ],
    # only loaded in demonstration mode
    'demo': [
        'demo/demo.xml',
    ],
}

