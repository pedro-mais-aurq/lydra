import Image from "next/image";
import Link from "next/link";

type LydraLogoProps = {
  compact?: boolean;
  priority?: boolean;
};

export function LydraLogo({ compact = false, priority = false }: LydraLogoProps) {
  return (
    <Link className={`brand-lockup${compact ? " brand-lockup-compact" : ""}`} href="/" aria-label="Lydra — página inicial">
      <Image
        src="/brand/lydra.svg"
        alt="Lydra — Decida antes que o dinheiro vá."
        width={1106}
        height={357}
        priority={priority}
      />
    </Link>
  );
}
