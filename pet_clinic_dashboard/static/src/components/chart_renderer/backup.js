

/** @odoo-module */
import { registry } from "@web/core/registry";
import { loadJS } from "@web/core/assets";
const { Component, onWillStart, useRef, onMounted } = owl;
import { useService } from "@web/core/utils/hooks";

export class ChartRenderer extends Component {
    setup() {
        this.chartRef = useRef("chart");
        this.orm = useService('orm');
        this.state = { labels: [], datasets: [] };
        this.actionService = useService("action");
        console.log('cek action service: ' + this.actionService); // Cek apakah berhasil

        this.handleChartClick = this.handleChartClick.bind(this);

        onWillStart(async () => {
            await loadJS("https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js");
            await this.fetchAndProcessData();
        });

        onMounted(() => {
            this.renderChart();
            this.attachEventListeners();
        });
    }


    async fetchAndProcessData(startDate = null, endDate = null) {
        const domain = startDate && endDate ? [['jam_antar', '>=', startDate], ['jam_antar', '<=', endDate]] : [];

        try {
            const clientData = await this.orm.call('client_clinic.client_clinic', 'search_read', [
                domain, ['id', 'name', 'jam_antar', 'product_line_ids']
            ]);
            const saleData = await this.extractSaleData(clientData);
            await this.processData(saleData);
        } catch (error) {
            console.error('Error fetching data:', error);
        }
    }

    async extractSaleData(clientData) {
        const saleDataPromises = clientData.map(async client => {
            if (client.product_line_ids) {
                const productLines = await this.orm.call('client_clinic.product_line', 'search_read', [
                    [['id', 'in', client.product_line_ids]],
                    ['product_name', 'client_clinic_id', 'quantity', 'quantity_selected', 'total_price']
                ]);
                return productLines.map(line => ({
                    jam_antar: client.jam_antar,
                    name: line.product_name,
                    qty_to_invoice: line.quantity_selected,
                    price_total: line.total_price,
                    client_clinic_id: client.id
                }));
            }
            return [];
        });

        const saleData = (await Promise.all(saleDataPromises)).flat();
        console.log('Sale Data:', saleData); // Check extracted sale data
        return saleData;
    }

    async processData(saleData) {
        const groupedData = this.groupData(saleData);
        const labels = Object.keys(groupedData);
        const data = labels.map(label => groupedData[label].total);

        const backgroundColors = labels.map((_, index) => this.getDiverseGradientColor(index, labels.length));
        const borderColors = backgroundColors;

        this.state.labels = labels;
        this.state.datasets = [{
            label: this.getChartLabel(),
            data: data,
            backgroundColor: backgroundColors,
            borderColor: borderColors,
            borderWidth: 3,
            hoverOffset: 4,
            client_clinic_ids: labels.map(label => groupedData[label].client_clinic_ids)
        }];


        this.renderChart();
    }

    groupData(saleData) {
        return saleData.reduce((acc, order) => {
            // Tentukan key berdasarkan tipe chart
            let key;
            if (this.props.type === 'line') {
                const jamAntar = new Date(order.jam_antar);
                key = new Date(jamAntar.getTime() - jamAntar.getTimezoneOffset() * 60000)
                    .toISOString()
                    .split('T')[0]; // Grup berdasarkan tanggal untuk line chart
            } else {
                key = order.name; // Grup berdasarkan nama untuk chart lain
            }

            // Inisialisasi grup jika belum ada
            if (!acc[key]) {
                acc[key] = { total: 0, client_clinic_ids: [] };
            }

            // Tambahkan client_clinic_id ke array jika belum ada
            if (!acc[key].client_clinic_ids.includes(order.client_clinic_id)) {
                acc[key].client_clinic_ids.push(order.client_clinic_id);
            }

            // Agregasi berdasarkan tipe chart
            acc[key].total += this.props.type === 'doughnut'
                ? order.qty_to_invoice
                : order.price_total;

            return acc;
        }, {});
    }





    renderChart() {
        if (!this.chartRef.el) {
            console.error('Chart element not found');
            return;
        }

        if (this.chartInstance) {
            this.chartInstance.destroy();
            this.chartInstance = null;
        }

        try {
            this.chartInstance = new Chart(this.chartRef.el, {
                type: this.props.type,
                data: {
                    labels: this.state.labels,
                    datasets: this.state.datasets
                },
                options: {
                    responsive: true,
                    indexAxis: this.props.type === 'bar' ? 'y' : 'x',
                    plugins: {
                        legend: {
                            position: 'bottom',
                            display: this.props.type !== "bar" && this.props.type !== "line",
                        },
                        title: {
                            display: true,
                            text: this.props.title || 'Sales Chart',
                            position: 'bottom',
                        }
                    },
                    onClick: (evt) => this.handleChartClick(evt)
                }
            });
        } catch (error) {
            console.error('Error rendering chart:', error);
        }
    }

    // handleChartClick(evt) {
    //   const activePoints = this.chartInstance.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, false);
    //   if (activePoints.length > 0) {
    //     const firstPoint = activePoints[0];
    //     const datasetIndex = firstPoint.datasetIndex;
    //     const label = this.chartInstance.data.labels[firstPoint.index];
    //     const clientClinicIds = this.state.datasets[datasetIndex].client_clinic_ids[firstPoint.index];

    //     console.log(`Clicked on label: ${label}, associated client_clinic_ids: ${clientClinicIds.join(', ')}`);
    //   }
    // }

    handleChartClick(evt) {
        const activePoints = this.chartInstance.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, false);
        if (activePoints.length > 0) {
            const firstPoint = activePoints[0];
            const datasetIndex = firstPoint.datasetIndex;
            const label = this.chartInstance.data.labels[firstPoint.index];
            const clientClinicIds = this.state.datasets[datasetIndex].client_clinic_ids[firstPoint.index];
            // console.log('clientClinicIds :' + clientClinicIds)
            const test = ['CL_000001', 'CL_000002']
            const test1 = [54, 55]
            const test2 = ['54', '55']
            console.log('test :' + test)

            // Arahkan ke tampilan list dengan filter berdasarkan client_clinic_ids
            this.actionService.do_action({
                name: "Client Clinic List",
                type: "ir.actions.act_window",
                res_model: "client_clinic.client_clinic",
                view_mode: "tree",
                views: [[false, "tree"]],
                target: "current",
                // domain: [["id", "in", [54,55]]], // Filter berdasarkan client_clinic_ids
                domain: [["name", "in", test]], // Filter berdasarkan client_clinic_ids
                // domain: [["id", "in", test1]], // Filter berdasarkan client_clinic_ids
                // domain: [["id", "in", test2]], // Filter berdasarkan client_clinic_ids
            });
        }
    }

    // async handleChartClick(evt) {
    //   const activePoints = this.chartInstance.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, false);
    //   if (activePoints.length > 0) {
    //     const firstPoint = activePoints[0];
    //     const datasetIndex = firstPoint.datasetIndex;
    //     const clientClinicIds = this.state.datasets[datasetIndex].client_clinic_ids[firstPoint.index];
    //     const test = ['CL_000001', 'CL_000002']

    //     console.log('clientClinicIds:', clientClinicIds);

    //     // Ambil nama berdasarkan clientClinicIds
    //     const clientClinicNames = await this.fetchClientClinicNames(clientClinicIds);
    //     console.log('Client Clinic Names:', clientClinicNames);
    //     console.log('Client Clinic Test:', test);

    //     // Arahkan ke tampilan list dengan filter berdasarkan nama
    //     this.actionService.do_action({
    //       name: "Client Clinic List",
    //       type: "ir.actions.act_window",
    //       res_model: "client_clinic.client_clinic",
    //       view_mode: "tree",
    //       views: [[false, "tree"]],
    //       target: "current",
    //       domain: [["name", "in", test]], // Filter berdasarkan nama
    //     });
    //   }
    // }


    async fetchClientClinicNames(clientClinicIds) {
        const clinics = await this.orm.searchRead('client_clinic.client_clinic', [['id', 'in', clientClinicIds]], ['name']);
        return clinics.map(clinic => clinic.name);
    }




    getChartLabel() {
        if (this.props.type === 'doughnut') return 'Kuantitas';
        if (this.props.type === 'bar') return 'Total Price';
        return 'Total Revenue';
    }

    getDiverseGradientColor(index, totalItems) {
        const gradientColors = [
            [[255, 102, 102], [255, 178, 178]],
            [[102, 204, 255], [178, 229, 255]],
            [[102, 255, 178], [178, 255, 229]],
            [[255, 153, 102], [255, 204, 178]],
            [[153, 102, 255], [204, 178, 255]],
        ];

        const colorPair = gradientColors[index % gradientColors.length];
        const startColor = colorPair[0];
        const endColor = colorPair[1];

        const r = this.interpolate(startColor[0], endColor[0], index / totalItems);
        const g = this.interpolate(startColor[1], endColor[1], index / totalItems);
        const b = this.interpolate(startColor[2], endColor[2], index / totalItems);
        const alpha = 0.7;

        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    interpolate(startValue, endValue, factor) {
        return Math.round(startValue + (endValue - startValue) * factor);
    }

    attachEventListeners() {
        const startDateInput = document.getElementById("startDate");
        const endDateInput = document.getElementById("endDate");

        startDateInput.addEventListener('change', () => this.filterData());
        endDateInput.addEventListener('change', () => this.filterData());
    }

    filterData() {
        const startDate = document.getElementById("startDate").value;
        const endDate = document.getElementById("endDate").value;

        if (startDate && endDate) {
            const formattedStartDate = new Date(startDate).toISOString().split('T')[0];
            const formattedEndDate = new Date(endDate).toISOString().split('T')[0];

            this.fetchAndProcessData(formattedStartDate, formattedEndDate);
        }
    }
}

ChartRenderer.template = "owl.ChartRenderer";




// /** @odoo-module */
// import { registry } from "@web/core/registry";
// import { loadJS } from "@web/core/assets";
// const { Component, onWillStart, useRef, onMounted } = owl;
// import { useService } from "@web/core/utils/hooks";

// export class ChartRenderer extends Component {
//     setup() {
//         this.chartRef = useRef("chart");
//         this.orm = useService('orm');
//         this.state = { labels: [], datasets: [] };
//         this.actionService = this.env.services.action;

//         this.handleChartClick = this.handleChartClick.bind(this);

//         onWillStart(async () => {
//             await loadJS("https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js");
//             await this.fetchAndProcessData();
//         });

//         onMounted(() => {
//             this.renderChart();
//             this.attachEventListeners();
//         });
//     }


//     async fetchAndProcessData(startDate = null, endDate = null) {
//         const domain = startDate && endDate ? [['jam_antar', '>=', startDate], ['jam_antar', '<=', endDate]] : [];

//         try {
//             const clientData = await this.orm.call('client_clinic.client_clinic', 'search_read', [
//                 domain, ['id', 'name', 'jam_antar', 'product_line_ids']
//             ]);
//             const saleData = await this.extractSaleData(clientData);
//             await this.processData(saleData);
//         } catch (error) {
//             console.error('Error fetching data:', error);
//         }
//     }

//     async extractSaleData(clientData) {
//         const saleDataPromises = clientData.map(async client => {
//             if (client.product_line_ids) {
//                 const productLines = await this.orm.call('client_clinic.product_line', 'search_read', [
//                     [['id', 'in', client.product_line_ids]],
//                     ['product_name', 'client_clinic_id', 'quantity', 'quantity_selected', 'total_price']
//                 ]);
//                 return productLines.map(line => ({
//                     jam_antar: client.jam_antar,
//                     name: line.product_name,
//                     qty_to_invoice: line.quantity_selected,
//                     price_total: line.total_price,
//                     client_clinic_id: client.id
//                 }));
//             }
//             return [];
//         });

//         const saleData = (await Promise.all(saleDataPromises)).flat();
//         console.log('Sale Data:', saleData); // Check extracted sale data
//         return saleData;
//     }

//     async processData(saleData) {
//         const groupedData = this.groupData(saleData);
//         const labels = Object.keys(groupedData);
//         const data = labels.map(label => groupedData[label].total);

//         const backgroundColors = labels.map((_, index) => this.getDiverseGradientColor(index, labels.length));
//         const borderColors = backgroundColors;

//         this.state.labels = labels;
//         this.state.datasets = [{
//             label: this.getChartLabel(),
//             data: data,
//             backgroundColor: backgroundColors,
//             borderColor: borderColors,
//             borderWidth: 3,
//             hoverOffset: 4,
//             client_clinic_ids: labels.map(label => groupedData[label].client_clinic_ids)
//         }];


//         this.renderChart();
//     }

//     groupData(saleData) {
//         return saleData.reduce((acc, order) => {
//             // Tentukan key berdasarkan tipe chart
//             let key;
//             if (this.props.type === 'line') {
//                 const jamAntar = new Date(order.jam_antar);
//                 key = new Date(jamAntar.getTime() - jamAntar.getTimezoneOffset() * 60000)
//                     .toISOString()
//                     .split('T')[0]; // Grup berdasarkan tanggal untuk line chart
//             } else {
//                 key = order.name; // Grup berdasarkan nama untuk chart lain
//             }

//             // Inisialisasi grup jika belum ada
//             if (!acc[key]) {
//                 acc[key] = { total: 0, client_clinic_ids: [] };
//             }

//             // Tambahkan client_clinic_id ke array jika belum ada
//             if (!acc[key].client_clinic_ids.includes(order.client_clinic_id)) {
//                 acc[key].client_clinic_ids.push(order.client_clinic_id);
//             }

//             // Agregasi berdasarkan tipe chart
//             acc[key].total += this.props.type === 'doughnut'
//                 ? order.qty_to_invoice
//                 : order.price_total;

//             return acc;
//         }, {});
//     }





//     renderChart() {
//         if (!this.chartRef.el) {
//             console.error('Chart element not found');
//             return;
//         }

//         if (this.chartInstance) {
//             this.chartInstance.destroy();
//             this.chartInstance = null;
//         }

//         try {
//             this.chartInstance = new Chart(this.chartRef.el, {
//                 type: this.props.type,
//                 data: {
//                     labels: this.state.labels,
//                     datasets: this.state.datasets
//                 },
//                 options: {
//                     responsive: true,
//                     indexAxis: this.props.type === 'bar' ? 'y' : 'x',
//                     plugins: {
//                         legend: {
//                             position: 'bottom',
//                             display: this.props.type !== "bar" && this.props.type !== "line",
//                         },
//                         title: {
//                             display: true,
//                             text: this.props.title || 'Sales Chart',
//                             position: 'bottom',
//                         }
//                     },
//                     onClick: (evt) => this.handleChartClick(evt)
//                 }
//             });
//         } catch (error) {
//             console.error('Error rendering chart:', error);
//         }
//     }

//     // handleChartClick(evt) {
//     //   const activePoints = this.chartInstance.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, false);
//     //   if (activePoints.length > 0) {
//     //     const firstPoint = activePoints[0];
//     //     const datasetIndex = firstPoint.datasetIndex;
//     //     const label = this.chartInstance.data.labels[firstPoint.index];
//     //     const clientClinicIds = this.state.datasets[datasetIndex].client_clinic_ids[firstPoint.index];

//     //     console.log(`Clicked on label: ${label}, associated client_clinic_ids: ${clientClinicIds.join(', ')}`);
//     //   }
//     // }
//     handleChartClick(evt) {
//         const activePoints = this.chartInstance.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, false);
//         if (activePoints.length > 0) {
//             const firstPoint = activePoints[0];
//             const datasetIndex = firstPoint.datasetIndex;
//             const label = this.chartInstance.data.labels[firstPoint.index];
//             const clientClinicIds = this.state.datasets[datasetIndex].client_clinic_ids[firstPoint.index];

//             // Arahkan ke tampilan list dengan filter berdasarkan client_clinic_ids
//             this.actionService.do_action({
//                 name: "Client Clinic List",
//                 type: "ir.actions.act_window",
//                 res_model: "client_clinic.client_clinic",
//                 view_mode: "tree",
//                 views: [[false, "tree"]],
//                 target: "current",
//                 domain: [["id", "in", clientClinicIds]], // Filter berdasarkan client_clinic_ids
//             });
//         }
//     }



//     getChartLabel() {
//         if (this.props.type === 'doughnut') return 'Kuantitas';
//         if (this.props.type === 'bar') return 'Total Price';
//         return 'Total Revenue';
//     }

//     getDiverseGradientColor(index, totalItems) {
//         const gradientColors = [
//             [[255, 102, 102], [255, 178, 178]],
//             [[102, 204, 255], [178, 229, 255]],
//             [[102, 255, 178], [178, 255, 229]],
//             [[255, 153, 102], [255, 204, 178]],
//             [[153, 102, 255], [204, 178, 255]],
//         ];

//         const colorPair = gradientColors[index % gradientColors.length];
//         const startColor = colorPair[0];
//         const endColor = colorPair[1];

//         const r = this.interpolate(startColor[0], endColor[0], index / totalItems);
//         const g = this.interpolate(startColor[1], endColor[1], index / totalItems);
//         const b = this.interpolate(startColor[2], endColor[2], index / totalItems);
//         const alpha = 0.7;

//         return `rgba(${r}, ${g}, ${b}, ${alpha})`;
//     }

//     interpolate(startValue, endValue, factor) {
//         return Math.round(startValue + (endValue - startValue) * factor);
//     }

//     attachEventListeners() {
//         const startDateInput = document.getElementById("startDate");
//         const endDateInput = document.getElementById("endDate");

//         startDateInput.addEventListener('change', () => this.filterData());
//         endDateInput.addEventListener('change', () => this.filterData());
//     }

//     filterData() {
//         const startDate = document.getElementById("startDate").value;
//         const endDate = document.getElementById("endDate").value;

//         if (startDate && endDate) {
//             const formattedStartDate = new Date(startDate).toISOString().split('T')[0];
//             const formattedEndDate = new Date(endDate).toISOString().split('T')[0];

//             this.fetchAndProcessData(formattedStartDate, formattedEndDate);
//         }
//     }
// }

// ChartRenderer.template = "owl.ChartRenderer";



// /** @odoo-module */
// import { registry } from "@web/core/registry";
// import { loadJS } from "@web/core/assets";
// const { Component, onWillStart, useRef, onMounted } = owl;
// import { useService } from "@web/core/utils/hooks";

// export class ChartRenderer extends Component {
//   setup() {
//     this.chartRef = useRef("chart"); // Reference for the chart element
//     this.orm = useService('orm'); // Access Odoo ORM
//     this.state = { labels: [], datasets: [] }; // Initialize state for labels and datasets

//     onWillStart(async () => {
//       await loadJS("https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js");
//       await this.fetchAndProcessData(); // Fetch and process data
//     });

//     onMounted(() => {
//       this.renderChart(); // Render the chart after component is mounted
//       this.attachEventListeners(); // Attach event listeners for date input
//     });
//   }

//   // Function to fetch and process data based on input dates
//   async fetchAndProcessData(startDate = null, endDate = null) {
//     let domain = [];
//     if (startDate && endDate) {
//       domain = [['jam_antar', '>=', startDate], ['jam_antar', '<=', endDate]]; // Create domain filter based on date
//     }

//     try {
//       // Call Odoo ORM for data from the client_clinic model
//       const clientData = await this.orm.call('client_clinic.client_clinic', 'search_read', [
//         domain, ['id', 'name','jam_antar', 'product_line_ids',] // Fetch product_line_ids
//       ]);

//       console.log('Client Data:', clientData); // Log data for debugging

//       // Extract data from related product_line
//       const saleData = await this.extractSaleData(clientData);
//       console.log('Sale Data:', saleData); // Log sale data for debugging

//       await this.processData(saleData); // Process data after fetching
//     } catch (error) {
//       console.error('Error fetching data:', error);
//     }
//   }

//   // Function to extract sale data from client data
//   async extractSaleData(clientData) {
//     const saleData = [];

//     for (const client of clientData) {
//       if (client.product_line_ids) {
//         const productLines = await this.orm.call('client_clinic.product_line', 'search_read', [
//           [['id', 'in', client.product_line_ids]], // Fetch product lines based on IDs
//           ['product_name', 'quantity', 'quantity_selected', 'total_price'] // Specify the fields you want
//         ]);

//         productLines.forEach(line => {
//           saleData.push({
//             jam_antar: client.jam_antar,
//             name: line.product_name,
//             qty_to_invoice: line.quantity_selected,
//             price_total: line.total_price
//           });
//         });
//       }
//     }

//     return saleData;
//   }

//   // Function to process and group data based on chart type
//   async processData(saleData) {
//     let labels = [];
//     let data = [];

//     // Check chart type and process accordingly
//     const groupedData = this.groupData(saleData);

//     // Sort data by total price for bar chart
//     if (this.props.type === 'bar') {
//       const sortedEntries = Object.entries(groupedData).sort((a, b) => b[1].total - a[1].total);
//       labels = sortedEntries.map(entry => entry[0]);
//       data = sortedEntries.map(entry => entry[1].total);
//     } else {
//       labels = Object.keys(groupedData);
//       data = labels.map(label => groupedData[label].total);
//     }

//     // Generate gradient colors for the chart
//     const backgroundColors = labels.map((_, index) => this.getDiverseGradientColor(index, labels.length));
//     const borderColors = backgroundColors;

//     this.state.labels = labels;
//     this.state.datasets = [{
//       label: this.getChartLabel(),
//       data: data,
//       backgroundColor: backgroundColors,
//       borderColor: borderColors,
//       borderWidth: 3,
//       hoverOffset: 4
//     }];

//     this.renderChart();
//   }

//   // Function to group data based on chart type
//   groupData(saleData) {
//     return saleData.reduce((acc, order) => {
//       const key = this.props.type === 'line'
//         ? new Date(order.jam_antar).toISOString().split('T')[0] // Ambil hanya tanggal
//         : order.name; // Untuk chart jenis lain

//       if (!acc[key]) {
//         acc[key] = { total: 0 }; // Inisialisasi total jika key baru
//       }

//       // Pastikan total diupdate sesuai dengan jenis chart
//       acc[key].total += this.props.type === 'doughnut'
//         ? order.qty_to_invoice
//         : order.price_total; // Untuk line chart, gunakan price_total atau qty_to_invoice sesuai kebutuhan

//       return acc;
//     }, {});
//   }

//   // Function to get chart label
//   getChartLabel() {
//     if (this.props.type === 'doughnut') return 'Kuantitas';
//     if (this.props.type === 'bar') return 'Total Price';
//     return 'Total Revenue';
//   }

//   // Function to generate diverse gradient colors
//   getDiverseGradientColor(index, totalItems) {
//     const gradientColors = [
//       [[255, 102, 102], [255, 178, 178]],  // Light Red
//       [[102, 204, 255], [178, 229, 255]],  // Light Blue
//       [[102, 255, 178], [178, 255, 229]],  // Light Green
//       [[255, 153, 102], [255, 204, 178]],  // Light Orange
//       [[153, 102, 255], [204, 178, 255]],  // Light Purple
//     ];

//     const colorPair = gradientColors[index % gradientColors.length];
//     const startColor = colorPair[0];
//     const endColor = colorPair[1];

//     const r = this.interpolate(startColor[0], endColor[0], index / totalItems);
//     const g = this.interpolate(startColor[1], endColor[1], index / totalItems);
//     const b = this.interpolate(startColor[2], endColor[2], index / totalItems);
//     const alpha = 0.7;

//     return `rgba(${r}, ${g}, ${b}, ${alpha})`;
//   }

//   // Interpolation function for colors
//   interpolate(startValue, endValue, factor) {
//     return Math.round(startValue + (endValue - startValue) * factor);
//   }

//   // Function to render the chart
//   renderChart() {
//     if (!this.chartRef.el) {
//       console.error('Chart element not found');
//       return;
//     }

//     // Ensure previous chart instance is destroyed before creating a new one
//     if (this.chartInstance) {
//       this.chartInstance.destroy();
//       this.chartInstance = null;  // Reset instance to avoid multiple destructions
//     }

//     try {
//       // Create a new chart and store the instance
//       this.chartInstance = new Chart(this.chartRef.el, {
//         type: this.props.type,
//         data: {
//           labels: this.state.labels, // Labels from state
//           datasets: this.state.datasets // Datasets from state
//         },
//         options: {
//           responsive: true,
//           indexAxis: this.props.type === 'bar' ? 'y' : 'x', // Set horizontal bars for bar chart
//           plugins: {
//             legend: {
//               position: 'bottom',
//               display: this.props.type !== "bar" && this.props.type !== "line",
//             },
//             title: {
//               display: true,
//               text: this.props.title || 'Sales Chart',
//               position: 'bottom',
//             }
//           }
//         }
//       });
//     } catch (error) {
//       console.error('Error rendering chart:', error);
//     }
//   }

//   // Function to attach event listeners on date inputs
//   attachEventListeners() {
//     const startDateInput = document.getElementById("startDate");
//     const endDateInput = document.getElementById("endDate");

//     startDateInput.addEventListener('change', () => this.filterData());
//     endDateInput.addEventListener('change', () => this.filterData());
//   }

//   // Function to filter data based on date input
//   filterData() {
//     const startDate = document.getElementById("startDate").value;
//     const endDate = document.getElementById("endDate").value;

//     // Ensure the date format matches what Odoo expects
//     if (startDate && endDate) {
//       const formattedStartDate = new Date(startDate).toISOString().split('T')[0];
//       const formattedEndDate = new Date(endDate).toISOString().split('T')[0];

//       this.fetchAndProcessData(formattedStartDate, formattedEndDate);
//     }
//   }
// }

// ChartRenderer.template = "owl.ChartRenderer";


