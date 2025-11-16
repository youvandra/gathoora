module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        'brand-cream': '#FFF4E6',
        'brand-cocoa': '#3B2C20',
        'brand-brown': '#5C3D2E',
        'brand-peach': '#FFBFA3',
        'brand-coral': '#FF7F66',
        'brand-yellow': '#FFD66B',
        'brand-blue': '#87C5FF',
        'brand-green': '#87D39B'
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'ui-sans-serif', 'system-ui'],
        display: ['Bricolage Grotesque', 'Plus Jakarta Sans', 'ui-sans-serif']
      },
      boxShadow: {
        soft: '0 6px 20px rgba(0,0,0,0.06)'
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.25rem'
      }
    }
  },
  plugins: []
}
