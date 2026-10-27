// Icon SVG nội tuyến (nét theo bộ Lucide), luôn đi kèm chữ nên ẩn với trình đọc màn hình.
const PATHS = {
  copy: (
    <>
      <rect width="14" height="14" x="8" y="8" rx="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </>
  ),
  share: (
    <>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98" />
    </>
  ),
};

export function Icon({ name }: { name: keyof typeof PATHS }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      {PATHS[name]}
    </svg>
  );
}
