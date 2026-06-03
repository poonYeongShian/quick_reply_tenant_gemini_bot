module.exports = {
  content: ["./extension/dashboard.html", "./extension/app.js"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#FFF5F5",
          100: "#FED7D7",
          200: "#FEB2B2",
          500: "#FF5A5F",
          600: "#E04E52",
          700: "#C83C40",
          900: "#7B1F22",
        },
      },
    },
  },
  // Classes assembled dynamically in app.js (e.g. setPipelineStatus) that the
  // content scanner cannot see, so they are force-included here.
  safelist: [
    "bg-indigo-500/10",
    "bg-emerald-500/10",
    "bg-rose-500/10",
    "bg-slate-500/10",
    "text-indigo-400",
    "text-emerald-400",
    "text-rose-400",
    "text-slate-400",
  ],
};
