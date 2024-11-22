# -*- coding: utf-8 -*-
{
    'name' : 'Clinic Dashboard',
    'version' : '1.0',
    'summary': 'Clinic Dashboard',
    'sequence': -1,
    'description': """Clinic Custom Dashboard""",
    'category': 'extra',
    'depends' : ['base', 'web', 'pet-clinic'],
    'data': [
        'views/sales_dashboard.xml',
    ],
    'demo': [
    ],
    'installable': True,
    'application': True,
    'assets': {
        'web.assets_backend': [
            'pet_clinic_dashboard/static/src/components/**/*.js',
            'pet_clinic_dashboard/static/src/components/**/*.xml',
            'pet_clinic_dashboard/static/src/components/**/*.scss',
            'pet_clinic_dashboard\static\src\css\style.css',
            'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
        ],
        'web.assets_frontend': [
            'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
        ],
    },
}
