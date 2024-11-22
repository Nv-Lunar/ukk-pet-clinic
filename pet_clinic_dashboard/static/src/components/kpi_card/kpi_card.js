/** @odoo-module */

const { Component, onWillStart, onMounted } = owl;
import { useService } from "@web/core/utils/hooks";

export class KpiCard extends Component {
    setup() {
        this.orm = useService('orm');
        this.actionService = useService('action'); // Tambahkan ini
        const { startDate, endDate } = this.getStartAndEndOfMonth();

        this.state = {
            kpiData: [],
            startDate: startDate,
            endDate: endDate,
        };

        onMounted(() => {
            this.attachEventListeners();
        });

        onWillStart(async () => {
            try {
                await this.updateKpiData(this.state.startDate, this.state.endDate);
            } catch (error) {
                console.error("Failed to update KPI data:", error);
            }
        });
    }

    getStartAndEndOfMonth() {
        const now = new Date();

        // Tanggal awal bulan (1)
        const startDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)); // Awal bulan
        // Tanggal akhir bulan (menggunakan bulan berikutnya dan mengurangi 1 hari)
        const endDate = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)); // Akhir bulan

        // Tambahkan offset UTC+7 (waktu Indonesia)
        startDate.setHours(startDate.getHours() + 7);
        endDate.setHours(endDate.getHours() + 7);

        return {
            startDate: startDate.toISOString().split('T')[0], // Format YYYY-MM-DD
            endDate: endDate.toISOString().split('T')[0]      // Format YYYY-MM-DD
        };
    }


    async updateKpiData(startDate, endDate) {
        try {
            console.log(`Updating KPI data from ${startDate} to ${endDate}`);

            const dateDomain = [];
            if (startDate && endDate) {
                dateDomain.push(['booking_date', '>=', startDate], ['booking_date', '<=', endDate]);
            }

            const currentPeriodOrders = await this.orm.call('client_clinic.client_clinic', 'search_read', [
                dateDomain,
                ['name', 'total_price', 'booking_date', 'product_line_ids']
            ]);

            await this.loadProductLines(currentPeriodOrders);

            let previousPeriodOrders = [];
            if (startDate && endDate) {
                const previousPeriodStartDate = this.getStartOfPreviousPeriod(startDate, endDate);
                const previousPeriodEndDate = this.getEndOfPreviousPeriod(startDate, endDate);

                previousPeriodOrders = await this.orm.call('client_clinic.client_clinic', 'search_read', [
                    [['booking_date', '>=', previousPeriodStartDate], ['booking_date', '<=', previousPeriodEndDate]],
                    ['name', 'total_price', 'booking_date', 'product_line_ids']
                ]);

                await this.loadProductLines(previousPeriodOrders);
            }

            console.log("currentPeriodOrders: ", currentPeriodOrders);
            console.log("previousPeriodOrders: ", previousPeriodOrders);

            this.processKpiData(currentPeriodOrders, previousPeriodOrders);
        } catch (error) {
            console.error("Error updating KPI data:", error);
        }
    }

    async loadProductLines(orders) {
        const allProductLineIds = new Set();

        // Kumpulkan semua product_line_ids
        for (const order of orders) {
            if (order.product_line_ids) {
                order.product_line_ids.forEach(id => allProductLineIds.add(id));
            }
        }

        // Ambil semua product lines dalam satu panggilan
        const productLines = await this.orm.call('client_clinic.product_line', 'search_read', [
            [['id', 'in', [...allProductLineIds]]],
            ['product_id', 'product_name', 'quantity', 'quantity_selected']
        ]);

        // Simpan product lines ke masing-masing order
        for (const order of orders) {
            order.product_lines = productLines.filter(line => order.product_line_ids.includes(line.id));
        }
    }


    formatLargeNumber(number) {
        if (number >= 1000000) {
            return (number / 1000000).toFixed(1).replace(/\.0$/, '') + ' jt';
        } else if (number >= 1000) {
            return (number / 1000).toFixed(0) + 'rb';
        }
        return number.toFixed(0);
    }

    getStartOfPreviousPeriod(startDate, endDate) {
        const currentStart = new Date(startDate);
        const currentEnd = new Date(endDate);
        const periodDays = Math.max(1, Math.ceil((currentEnd - currentStart) / (1000 * 60 * 60 * 24)) + 1);

        const previousStart = new Date(currentStart);
        previousStart.setDate(currentStart.getDate() - periodDays);

        return previousStart.toISOString().split('T')[0];
    }

    getEndOfPreviousPeriod(startDate) {
        const currentStart = new Date(startDate);
        const previousEnd = new Date(currentStart);
        previousEnd.setDate(currentStart.getDate() - 1);

        return previousEnd.toISOString().split('T')[0];
    }

    processKpiData(currentPeriodOrders, previousPeriodOrders) {
        const totalOrdersCurrent = currentPeriodOrders.length || 0;
        const totalOrdersPrevious = previousPeriodOrders.length || 0;

        const revenueCurrent = currentPeriodOrders.reduce((sum, order) => sum + (order.total_price || 0), 0);
        const revenuePrevious = previousPeriodOrders.reduce((sum, order) => sum + (order.total_price || 0), 0);

        const totalProductSoldCurrent = currentPeriodOrders.reduce((sum, order) => {
            return sum + (order.product_lines?.reduce((lineSum, line) => lineSum + (line.quantity_selected || 0), 0) || 0);
        }, 0);

        const totalProductSoldPrevious = previousPeriodOrders.reduce((sum, order) => {
            return sum + (order.product_lines?.reduce((lineSum, line) => lineSum + (line.quantity_selected || 0), 0) || 0);
        }, 0);

        const revenueFormatted = this.formatLargeNumber(revenueCurrent);
        const totalProductSoldFormatted = totalProductSoldCurrent.toLocaleString('id-ID');

        const percentageChange = (current, previous) => {
            if (previous === 0 && current > 0) {
                return 100;
            } else if (previous === 0 && current === 0) {
                return 0;
            } else if (previous === 0 && current < 0) {
                return -100;
            }
            return ((current - previous) / previous) * 100;
        };

        const percentageChangeRevenue = percentageChange(revenueCurrent, revenuePrevious);
        const percentageChangeOrders = percentageChange(totalOrdersCurrent, totalOrdersPrevious);
        const percentageChangeProductSold = percentageChange(totalProductSoldCurrent, totalProductSoldPrevious);

        const getColor = (percentage) => {
            if (percentage > 0) return 'green';
            if (percentage < 0) return 'red';
            return 'gray';
        };

        this.state.kpiData = [
            {
                name: 'Revenue',
                value: revenueFormatted,
                percentage: percentageChangeRevenue.toFixed(2),
                color: getColor(percentageChangeRevenue),
                icon: 'fa-money-bill',
            },
            {
                name: 'Orders',
                value: totalOrdersCurrent,
                percentage: percentageChangeOrders.toFixed(2),
                color: getColor(percentageChangeOrders),
                icon: 'fa-shopping-cart',
            },
            {
                name: 'Product Sold',
                value: totalProductSoldFormatted,
                percentage: percentageChangeProductSold.toFixed(2),
                color: getColor(percentageChangeProductSold),
                icon: 'fa-boxes',
            }
        ];

        console.log('KPI Data:', this.state.kpiData);
        this.render();
    }

    attachEventListeners() {
        const startDateInput = document.getElementById("startDate");
        const endDateInput = document.getElementById("endDate");
        const kpiCards = document.querySelectorAll('.kpi-card'); // Ganti dengan selector yang sesuai untuk KPI Card

        if (startDateInput) {
            startDateInput.addEventListener('change', () => {
                console.log('Start date changed');
                this.filterData(); // Memanggil filterData saat tanggal mulai berubah
            });
        }

        if (endDateInput) {
            endDateInput.addEventListener('change', () => {
                console.log('End date changed');
                this.filterData(); // Memanggil filterData saat tanggal akhir berubah
            });
        }

        kpiCards.forEach(card => {
            card.addEventListener('click', (evt) => {
                this.handleKpiCardClick(evt); // Menghubungkan event click dengan fungsi handler
            });
        });
    }

    async handleKpiCardClick(evt) {
        const cardName = evt.currentTarget.dataset.name; // Mengambil nama dari data attribute
        let { startDate, endDate } = this.state; // Mengambil tanggal dari state

        // Pastikan tanggal diformat dengan benar (ISO format)
        startDate = new Date(startDate).toISOString().split('T')[0];
        endDate = new Date(endDate).toISOString().split('T')[0];

        console.log('startDate :' + startDate)
        console.log('endDate :' + endDate)

        console.log(`Redirecting to detail view for ${cardName} from ${startDate} to ${endDate}`);

        // Mengarahkan ke tampilan list dengan filter berdasarkan KPI yang relevan
        await this.actionService.doAction({
            name: `${cardName} Detail`,
            type: 'ir.actions.act_window',
            res_model: 'client_clinic.client_clinic',
            view_mode: 'tree',
            views: [[false, 'tree']],
            target: 'current',
            domain: [
                ['booking_date', '>=', startDate],
                ['booking_date', '<=', endDate]
            ],
        });
    }



    filterData() {
        const startDate = document.getElementById("startDate")?.value;
        const endDate = document.getElementById("endDate")?.value;

        console.log(`Filtering data from ${startDate} to ${endDate}`);

        if (!startDate && !endDate) {
            this.updateKpiData(null, null);
        } else {
            const formattedStartDate = startDate ? new Date(startDate).toISOString().split('T')[0] : null;
            const formattedEndDate = endDate ? new Date(endDate).toISOString().split('T')[0] : null;

            this.updateKpiData(formattedStartDate, formattedEndDate);
        }
    }

    render() {
        const kpiContainer = document.querySelector(".row");

        // Clear existing elements
        kpiContainer.innerHTML = '';

        // Render new KPI Cards
        this.state.kpiData.forEach(kpi => {
            const cardHtml = `
            <div class="col-lg-4 m-0 p-0 my-lg-0 my-5">
                <div class="position-relative shadow-sm border m-2 p-4 bg-white text-center kpi-card" data-name="${kpi.name}">
                    <div class="circle-container position-absolute" style="top: -50px; left: 50%; transform: translateX(-50%);">
                        <i class="fa ${kpi.icon} circle-icon"></i>
                    </div>
                    <div class="h3 text-muted" style="margin-top: 30px;">
                        ${kpi.name}
                    </div>
                    <div class="h1 fw-bold text-dark" style="font-size: 35px;">
                        ${kpi.value}
                    </div>
                    <div class="h3 mt-3">
                        <span class="text-${kpi.percentage > 0 ? 'success' : 'danger'}">
                            <i class="me-1 fa fa-arrow-${kpi.percentage > 0 ? 'up' : 'down'}"></i>
                            ${kpi.percentage}%
                        </span>
                        <span> since last period</span>
                    </div>
                </div>
            </div>`;

            kpiContainer.innerHTML += cardHtml;
        });

        // Setelah render, pasang ulang event listener
        this.attachEventListeners();
    }


}

KpiCard.template = 'owl.KpiCard';
