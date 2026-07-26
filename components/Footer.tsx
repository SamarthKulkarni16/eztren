export default function Footer() {
  return (
    <footer className="border-t border-steel-line mt-24">
      <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <p className="font-data text-[12px] uppercase tracking-wider text-steel">
          Eztren &mdash; est. 2026
        </p>
        <p className="font-data text-[12px] text-steel max-w-md sm:text-right">
          A &rarr; B &rarr; C &hellip; Z &rarr; AA &hellip; every match, archived.
        </p>
      </div>
    </footer>
  );
}
