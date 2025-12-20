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
            },
            colors: {
                primary: '#4f46e5',
                secondary: '#64748b',
                background: {
                    light: '#f8fafc',
                    dark: '#0f172a'
                }
            }
        },
    },
    plugins: [],
}
