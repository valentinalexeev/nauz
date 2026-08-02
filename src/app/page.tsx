import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-24 text-center gap-8">
      <div className="max-w-2xl flex flex-col gap-6">
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">
          Науз
        </h1>
        <p className="text-lg text-neutral-600">
          Сказки и письма для детей — голосом мамы, папы или близких,
          даже когда рядом их нет.
        </p>
        <p className="text-sm text-neutral-500">
          Науз — древний оберег-узел. Мы завязываем такой из голоса
          родителя, чтобы сказка на ночь звучала даже на расстоянии.
        </p>
        <div className="flex items-center justify-center gap-4 pt-4">
          <Link
            href="/login"
            className="rounded-full bg-neutral-900 text-white px-6 py-3 text-sm font-medium hover:bg-neutral-700 transition-colors"
          >
            Начать
          </Link>
        </div>
      </div>
    </main>
  );
}
