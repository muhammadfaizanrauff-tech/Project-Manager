import Image from "next/image";
import { cn } from "@/lib/utils";

export function Logo({
  className,
  iconOnly = false,
  size = 32,
}: {
  className?: string;
  iconOnly?: boolean;
  size?: number;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className="relative shrink-0"
        style={{ width: size, height: size }}
      >
        <Image
          src="/brand/logo-icon.png"
          alt="Project Manager"
          fill
          sizes={`${size}px`}
          className="object-contain"
          priority
        />
      </div>
      {!iconOnly && (
        <span className="text-[15px] font-semibold tracking-tight">
          Project Manager
        </span>
      )}
    </div>
  );
}

export function LogoMark({ size = 96 }: { size?: number }) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <Image
        src="/brand/logo-icon.png"
        alt="Project Manager"
        fill
        sizes={`${size}px`}
        className="object-contain"
        priority
      />
    </div>
  );
}

export function LogoFull({ width = 180 }: { width?: number }) {
  return (
    <Image
      src="/brand/logo.png"
      alt="Project Manager"
      width={width}
      height={width}
      className="object-contain"
      priority
    />
  );
}
