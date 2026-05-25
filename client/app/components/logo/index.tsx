interface LogoProps {
  src?: string;
  alt?: string;
  width?: number;
  height?: number;
  className?: string;
}

import { useTheme } from "@/hooks/use-theme";

export function Logo({ src, alt, width, height, className }: LogoProps) {
  const { resolvedTheme } = useTheme();

  if (src) {
    return (
      <img
        src={src}
        alt={alt ?? "SELISE Logo"}
        width={width}
        height={height}
        className={className}
      />
    );
  }

  return (
    <>
      <img
        src="../../public/Logo_Black.svg"
        alt={alt ?? "SELISE Logo"}
        width={width}
        height={height}
        className={`${className ?? ""} dark:hidden`}
      />
      <img
        src="../../public/Logo_White.svg"
        alt={alt ?? "SELISE Logo"}
        width={width}
        height={height}
        className={`${className ?? ""} hidden dark:block`}
      />
    </>
  );
}
