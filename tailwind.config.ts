import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        chart: {
          "1": "var(--chart-1)",
          "2": "var(--chart-2)",
          "3": "var(--chart-3)",
          "4": "var(--chart-4)",
          "5": "var(--chart-5)",
        },
        sidebar: {
          DEFAULT: "var(--sidebar)",
          foreground: "var(--sidebar-foreground)",
          primary: "var(--sidebar-primary)",
          "primary-foreground": "var(--sidebar-primary-foreground)",
          accent: "var(--sidebar-accent)",
          "accent-foreground": "var(--sidebar-accent-foreground)",
          border: "var(--sidebar-border)",
          ring: "var(--sidebar-ring)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        serif: ["var(--font-serif)"],
        mono: ["var(--font-mono)"],
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        "pulse-glow": {
          "0%, 100%": {
            opacity: "1",
            transform: "scale(1)",
          },
          "50%": {
            opacity: "0.7",
            transform: "scale(1.1)",
          },
        },
        "fade-in": {
          "0%": {
            opacity: "0",
            transform: "translateY(10px)",
          },
          "100%": {
            opacity: "1",
            transform: "translateY(0)",
          },
        },
        "slide-in": {
          "0%": {
            transform: "translateX(-100%)",
          },
          "100%": {
            transform: "translateX(0)",
          },
        },
        "loading": {
          "0%": {
            "background-position": "200% 0",
          },
          "100%": {
            "background-position": "-200% 0",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "fade-in": "fade-in 0.3s ease-out",
        "slide-in": "slide-in 0.3s ease-out",
        "loading": "loading 1.5s infinite",
      },
      spacing: {
        "18": "4.5rem",
        "88": "22rem",
      },
      maxWidth: {
        "8xl": "88rem",
        "9xl": "96rem",
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.75rem" }],
      },
      backdropBlur: {
        xs: "2px",
      },
      boxShadow: {
        "inner-lg": "inset 0 2px 4px 0 rgba(0, 0, 0, 0.1)",
        "glow": "0 0 20px rgba(59, 130, 246, 0.5)",
        "glow-sm": "0 0 10px rgba(59, 130, 246, 0.3)",
      },
      transitionProperty: {
        "height": "height",
        "spacing": "margin, padding",
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"), 
    require("@tailwindcss/typography"),
    // Custom plugin for ConversaAI specific utilities
    function({ addUtilities }: { addUtilities: any }) {
      const newUtilities = {
        '.text-shadow': {
          textShadow: '0 2px 4px rgba(0,0,0,0.1)',
        },
        '.text-shadow-lg': {
          textShadow: '0 4px 8px rgba(0,0,0,0.12), 0 2px 4px rgba(0,0,0,0.08)',
        },
        '.backdrop-blur-xs': {
          backdropFilter: 'blur(2px)',
        },
        '.conversation-card': {
          transition: 'all 0.2s ease-in-out',
        },
        '.conversation-card:hover': {
          transform: 'translateY(-1px)',
        },
        '.metric-indicator': {
          position: 'relative',
          display: 'inline-block',
        },
        '.metric-indicator::after': {
          content: '""',
          position: 'absolute',
          top: '0',
          right: '0',
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          animation: 'pulse-glow 2s infinite',
        },
        '.metric-high::after': {
          background: 'rgb(34, 197, 94)',
        },
        '.metric-medium::after': {
          background: 'rgb(234, 179, 8)',
        },
        '.metric-low::after': {
          background: 'rgb(239, 68, 68)',
        },
        '.glass-effect': {
          background: 'rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        },
        '.decision-border-budget': {
          borderLeftColor: 'rgb(251, 146, 60)',
        },
        '.decision-border-technical': {
          borderLeftColor: 'rgb(59, 130, 246)',
        },
        '.decision-border-authority': {
          borderLeftColor: 'rgb(147, 51, 234)',
        },
        '.decision-border-need': {
          borderLeftColor: 'rgb(239, 68, 68)',
        },
        '.scrollbar-thin': {
          scrollbarWidth: 'thin',
        },
        '.scrollbar-hide': {
          scrollbarWidth: 'none',
          '-ms-overflow-style': 'none',
        },
        '.scrollbar-hide::-webkit-scrollbar': {
          display: 'none',
        },
      }
      addUtilities(newUtilities)
    }
  ],
} satisfies Config;
