interface LogoProps {
  src?: string;
  alt?: string;
  width?: number;
  height?: number;
  className?: string;
}

import { useTheme } from "@/hooks/use-theme";
import { useT } from "@seliseblocks/genesis-os/i18n";

export function Logo({ src, alt, width, height, className }: LogoProps) {
  const { t } = useT("data.shared");
  const { resolvedTheme } = useTheme();

  if (src) {
    return (
      <img
        src={src}
        alt={alt ?? t("LOGO.SELISE_LOGO")}
        width={width}
        height={height}
        className={className}
      />
    );
  }

  return (
    <>
      <img
        src="/blocks-logos/Logo_Black.svg"
        alt={alt ?? t("LOGO.SELISE_LOGO")}
        width={width}
        height={height}
        className={`${className ?? ""} dark:hidden`}
      />
      <img
        src="/blocks-logos/Logo_White.svg"
        alt={alt ?? t("LOGO.SELISE_LOGO")}
        width={width}
        height={height}
        className={`${className ?? ""} hidden dark:block`}
      />
    </>
  );
}
