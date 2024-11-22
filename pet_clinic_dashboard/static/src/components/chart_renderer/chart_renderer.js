

/** @odoo-module */
import { registry } from "@web/core/registry";
import { loadJS } from "@web/core/assets";
const { Component, onWillStart, useRef, onMounted } = owl;
import { useService } from "@web/core/utils/hooks";

export class ChartRenderer extends Component {
  setup() {
    this.chartRef = useRef("chart");
    this.orm = useService('orm');
    this.actionService = useService("action");

    // Debug logs to check if services are initialized
    console.log('ORM Service:', this.orm);
    console.log('Action Service:', this.actionService);

    this.state = { labels: [], datasets: [] };
    this.handleChartClick = this.handleChartClick.bind(this);

    onWillStart(async () => {
      await loadJS("https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js");

      // Mengatur tanggal awal dan akhir bulan ini
      const now = new Date();
      const startOfMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
      const endOfMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0)); // Mendapatkan hari terakhir bulan ini

      await this.fetchAndProcessData(startOfMonth.toISOString().split('T')[0], endOfMonth.toISOString().split('T')[0]);
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

    // Data agregat
    const data = labels.map(label => groupedData[label].total);

    // Urutkan data untuk bar chart
    if (this.props.type === 'bar') {
      const sortedData = labels.map(label => ({ label, total: groupedData[label].total }))
        .sort((a, b) => b.total - a.total); // Urutkan descending berdasarkan total

      this.state.labels = sortedData.map(item => item.label);
      this.state.datasets = [{
        label: this.getChartLabel(),
        data: sortedData.map(item => item.total),
        backgroundColor: sortedData.map((_, index) => this.getDiverseGradientColor(index, sortedData.length)),
        borderColor: sortedData.map((_, index) => this.getDiverseGradientColor(index, sortedData.length)),
        borderWidth: 3,
        hoverOffset: 4,
        client_clinic_ids: sortedData.map(item => groupedData[item.label].client_clinic_ids)
      }];
    } else {
      this.state.labels = labels;
      this.state.datasets = [{
        label: this.getChartLabel(),
        data: data,
        backgroundColor: labels.map((_, index) => this.getDiverseGradientColor(index, labels.length)),
        borderColor: labels.map((_, index) => this.getDiverseGradientColor(index, labels.length)),
        borderWidth: 3,
        hoverOffset: 4,
        client_clinic_ids: labels.map(label => groupedData[label].client_clinic_ids)
      }];
    }

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



  handleChartClick(evt) {
    console.log('this in handleChartClick:', this); // Debugging line
    console.log('Action Service:', this.actionService); // Check if actionService is defined

    const activePoints = this.chartInstance.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, false);
    if (activePoints.length > 0) {
      const firstPoint = activePoints[0];
      const datasetIndex = firstPoint.datasetIndex;
      const label = this.chartInstance.data.labels[firstPoint.index];
      const clientClinicIds = this.state.datasets[datasetIndex].client_clinic_ids[firstPoint.index];

      console.log("clientClinicIds :" + clientClinicIds)
      

      // Check if actionService is accessible and has doAction function
      if (this.actionService && typeof this.actionService.doAction === 'function') {
        this.actionService.doAction({
          name: "Client Clinic List",
          type: "ir.actions.act_window",
          res_model: "client_clinic.client_clinic",
          view_mode: "tree",
          views: [[false, "tree"]],
          target: "current",
          domain: [["id", "in", clientClinicIds]], // Uncomment for actual filtering
        });
      } else {
        console.error('actionService.doAction is not a function or actionService is undefined:', this.actionService);
      }
    }
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


