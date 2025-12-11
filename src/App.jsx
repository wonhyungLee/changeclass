import { ArrowRight, CalendarClock, Shuffle, Users } from 'lucide-react'

const quickActions = [
  {
    title: '새 반 배정 만들기',
    desc: '학급 수와 정원 기준을 설정해 자동 배정 시작',
    icon: Shuffle,
  },
  {
    title: '학생 이동 요청 처리',
    desc: '교사/학생 요청을 검토하고 배정 수정',
    icon: ArrowRight,
  },
  {
    title: '현재 배정 현황',
    desc: '학급별 인원, 성비, 특이사항을 한눈에 확인',
    icon: Users,
  },
]

const upcoming = [
  { title: '1학년 담임 회의', time: '오늘 15:00' },
  { title: '2학년 전입생 배치', time: '내일 10:30' },
  { title: '최종 배정 확정', time: '금요일 17:00' },
]

function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-cyan-300">반배정 프로그램</p>
            <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              ChangeClass 대시보드
            </h1>
            <p className="text-sm text-slate-300">
              학급 배정, 이동 요청, 일정 관리를 한 곳에서 처리하세요.
            </p>
          </div>
          <button className="inline-flex items-center gap-2 rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">
            새 배정 세션 시작
            <ArrowRight className="h-4 w-4" />
          </button>
        </header>

        <section className="mt-10 grid gap-6 md:grid-cols-3">
          {quickActions.map(({ title, desc, icon: Icon }) => (
            <article
              key={title}
              className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg shadow-slate-900/30 transition hover:-translate-y-1 hover:border-cyan-400/60 hover:shadow-cyan-500/20"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-500/10 text-cyan-300">
                  <Icon className="h-5 w-5" />
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-slate-50">{title}</h2>
              <p className="mt-2 text-sm text-slate-400">{desc}</p>
            </article>
          ))}
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg shadow-slate-900/30 lg:col-span-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-cyan-300">
              <Users className="h-4 w-4" />
              실시간 인원 현황
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              {[
                { label: '배정 완료 학생', value: '182명', tone: 'text-emerald-300' },
                { label: '이동 요청', value: '7건', tone: 'text-amber-300' },
                { label: '미배정', value: '3명', tone: 'text-rose-300' },
              ].map(({ label, value, tone }) => (
                <div
                  key={label}
                  className="rounded-xl border border-slate-800/80 bg-slate-900/70 p-4"
                >
                  <p className="text-xs text-slate-400">{label}</p>
                  <p className={`mt-2 text-2xl font-semibold ${tone}`}>{value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg shadow-slate-900/30">
            <div className="flex items-center gap-2 text-sm font-semibold text-cyan-300">
              <CalendarClock className="h-4 w-4" />
              다가오는 일정
            </div>
            <ul className="mt-4 space-y-3">
              {upcoming.map(({ title, time }) => (
                <li
                  key={title}
                  className="flex items-start justify-between rounded-xl border border-slate-800/70 bg-slate-900/80 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-50">{title}</p>
                    <p className="text-xs text-slate-400">{time}</p>
                  </div>
                  <span className="text-xs font-semibold text-cyan-300">대기</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  )
}

export default App
