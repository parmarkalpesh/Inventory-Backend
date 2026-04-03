const xlsx = require('xlsx');
const path = require('path');

const data = [
    { SKU: 'PROD-A', ProductName: 'Wireless Mouse', Location: 'Warehouse A', Date: '2026-01-01', Qty: 50 },
    { SKU: 'PROD-A', ProductName: 'Wireless Mouse', Location: 'Warehouse B', Date: '2026-02-01', Qty: 30 },
    { SKU: 'PROD-B', ProductName: 'Mechanical Keyboard', Location: 'Warehouse A', Date: '2026-01-15', Qty: 20 },
    { SKU: 'PROD-C', ProductName: 'USB-C Cable', Location: 'Warehouse C', Date: '2026-03-01', Qty: 100 },
];

const ws = xlsx.utils.json_to_sheet(data);
const wb = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(wb, ws, 'Inventory');

const filePath = path.join(__dirname, 'sample_inventory.xlsx');
xlsx.writeFile(wb, filePath);

console.log(`Sample Excel file created at: ${filePath}`);
