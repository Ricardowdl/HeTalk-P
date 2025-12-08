/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        brutal: {
          purple: '#9C5DAB',
          dark: '#423D54',
          light: '#E5E4E9',
        },
      },
      boxShadow: {
        brutal: '4px 4px 0px rgba(0,0,0,0.9)',
        brutalHover: '6px 6px 0px rgba(0,0,0,0.9)',
      },
      borderWidth: {
        brutal: '3px',
      },
      borderRadius: {
        brutal: '0px',
      },
    },
  },
  plugins: [],
};
