import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const GRADIENTS = [
  "from-sky-400 to-blue-500",
  "from-indigo-400 to-violet-500",
  "from-cyan-400 to-sky-500",
  "from-blue-400 to-indigo-500",
  "from-teal-400 to-cyan-500",
  "from-violet-400 to-fuchsia-500",
];

export function initialsFor(name?: string | null, fallback = "?"): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return fallback;
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function UserAvatar({
  name,
  image,
  id,
  className,
  fallbackClassName,
}: {
  name?: string | null;
  image?: string | null;
  id?: string;
  className?: string;
  fallbackClassName?: string;
}) {
  const hash = [...(id ?? name ?? "")].reduce(
    (acc, char) => acc + char.charCodeAt(0),
    0,
  );
  const gradient = GRADIENTS[hash % GRADIENTS.length];

  return (
    <Avatar
      className={cn("ring-2 ring-white/80 shadow-sm", className)}
    >
      {image ? <AvatarImage src={image} alt={name ?? ""} /> : null}
      <AvatarFallback
        className={cn(
          "bg-gradient-to-br font-semibold text-white",
          gradient,
          fallbackClassName,
        )}
      >
        {initialsFor(name)}
      </AvatarFallback>
    </Avatar>
  );
}
