



/** @odoo-module **/

import { Component, onWillStart } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";

export class ProductCardList extends Component {
    setup() {
        this.orm = useService('orm');
        this.state = {
            products: [],
        };

        onWillStart(async () => {
            await this.fetchTopSellingProducts();
        });
    }

    async fetchTopSellingProducts() {
        try {
            // Mengambil data dari model client_clinic.product_line
            const productData = await this.orm.call(
                'client_clinic.product_line', // Model
                'search_read',               // Method
                [[], ['product_name', 'total_price', 'quantity_selected']],  // Fields yang dibutuhkan
                { order: 'product_name asc' }  // Mengurutkan berdasarkan nama produk
            );

            // Mengelompokkan produk berdasarkan 'product_name'
            const groupedProducts = productData.reduce((acc, product) => {
                if (!acc[product.product_name]) {
                    // Jika produk dengan nama ini belum ada, inisialisasi
                    acc[product.product_name] = {
                        name: product.product_name,
                        totalSales: 0,
                        soldStock: 0,
                    };
                }
                // Menambahkan nilai 'total_price' dan 'quantity_selected' ke produk yang dikelompokkan
                acc[product.product_name].totalSales += product.total_price;
                acc[product.product_name].soldStock += product.quantity_selected;
                return acc;
            }, {});

            // Mengonversi object hasil reduce menjadi array dan mengurutkan berdasarkan 'totalSales'
            const groupedProductArray = Object.values(groupedProducts).map((product, index) => ({
                number: index + 1,  // Menambahkan nomor item
                name: product.name,  // Nama produk
                totalSales: this.formatCurrency(product.totalSales),  // Format total penjualan
                soldStock: product.soldStock  // Kuantitas terjual
            }));

            // Mengambil top 5 produk dengan penjualan tertinggi
            this.state.products = groupedProductArray
                .sort((a, b) => b.totalSales - a.totalSales)
                .slice(0, 5);  // Batasi ke 5 produk teratas

        } catch (error) {
            console.error("Error fetching product data:", error);
        }
    }

    // Format currency dengan "Rp" dan pemisah ribuan
    formatCurrency(amount) {
        return 'Rp ' + amount.toLocaleString('id-ID');
    }
}

ProductCardList.template = "owl.ProductCardList";
