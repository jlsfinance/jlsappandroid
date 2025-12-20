/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./index.html",
        "./**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: 'media',
    theme: {
        extend: {
            fontFamily: {
                sans: ['Outfit', 'sans-serif'],
                display: ['Inter', 'sans-serif'],
            },
            colors: {
                primary: '#4f46e5',
                'customer-primary': '#3b82f6',
                secondary: '#64748b',
                background: {
                    light: '#f8fafc',
                    dark: '#0f172a'
                },
                'surface-light': '#ffffff',
                'surface-dark': '#1f2937',
            }
        },
    },
    plugins: [],
}
