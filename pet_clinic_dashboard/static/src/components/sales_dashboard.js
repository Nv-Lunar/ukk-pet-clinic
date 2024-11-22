/** @odoo-module */

import { registry } from "@web/core/registry";
import { KpiCard } from "./kpi_card/kpi_card";
import { ChartRenderer } from "./chart_renderer/chart_renderer";
import { ProductCardList } from "./card_list/card_list";  // Tambahkan import
const { Component } = owl;

export class ClinicDashboard extends Component {
    setup() {
        // Logic tambahan jika diperlukan
    }
}

// Daftarkan komponen dan template
ClinicDashboard.template = "owl.ClinicDashboard";
ClinicDashboard.components = { KpiCard, ChartRenderer, ProductCardList };  // Tambahkan ProductCardList

registry.category("actions").add("owl.clinic_dashboard", ClinicDashboard);