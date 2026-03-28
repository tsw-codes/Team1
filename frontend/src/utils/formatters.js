export const formatCurrency = (value) => {
    const num = Number(value);

    if (isNaN(num)) return "$0.00";

    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(num);
};