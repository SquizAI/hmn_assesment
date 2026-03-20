interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export default function Button({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  const base = "inline-flex items-center justify-center font-medium rounded-xl transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 hover:scale-[1.02] shadow-sm";

  const variants: Record<string, string> = {
    primary: "bg-primary text-primary-foreground shadow-[0_4px_14px_0_theme(colors.primary.500/30)] hover:shadow-[0_6px_20px_theme(colors.primary.500/40)] hover:bg-primary/90 focus:ring-primary/50",
    secondary: "bg-card/80 backdrop-blur-md text-foreground hover:bg-card/100 focus:ring-muted-foreground/50 border border-border/50 shadow-inner",
    ghost: "bg-transparent text-foreground/80 hover:text-foreground hover:bg-muted/50 focus:ring-muted-foreground/30 !shadow-none",
    danger: "bg-red-500/10 text-red-500 hover:bg-red-500/20 focus:ring-red-500/50 border border-red-500/20 hover:border-red-500/30",
  };

  const sizes: Record<string, string> = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-5 py-2.5 text-sm",
    lg: "px-8 py-3.5 text-base",
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      )}
      {children}
    </button>
  );
}
