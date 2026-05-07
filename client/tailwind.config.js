/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        vs: {
          bg:            '#1C1B20',
          card:          '#24232A',
          elevated:      '#313038',
          hover:         '#3B3A42',
          purple:        '#775CDF',
          'purple-on':   '#6247CF',
          'purple-light':'#B19CFF',
          lime:          '#B5DB1C',
          'lime-on':     '#7E9E00',
          text:          '#FFFFFF',
          'text-2':      '#E2E2E2',
          'text-3':      '#9F9F9F',
          border:        '#303030',
          danger:        '#EB3333',
          success:       '#1CDB2F',
          warning:       '#F5CB3E',
        },
      },
    },
  },
  plugins: [],
};
