import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-steel-line mt-24">
      <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <p className="font-data text-[12px] uppercase tracking-wider text-steel">
            Eztren &mdash; est. 2026
          </p>
          <div className="flex gap-4">
            <Link
              href="/about"
              className="font-data text-[12px] uppercase tracking-wider text-steel hover:text-signal transition-colors"
            >
              About
            </Link>
            <a
              href="https://github.com/SamarthKulkarni16/eztren"
              target="_blank"
              rel="noopener noreferrer"
              className="font-data text-[12px] uppercase tracking-wider text-steel hover:text-signal transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
        <p className="font-data text-[12px] text-steel max-w-md sm:text-right">
          A &rarr; B &rarr; C &hellip; Z &rarr; AA &hellip; every match, archived.
        </p>
      </div>
    </footer>
  );
}
