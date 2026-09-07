import type { ReactNode } from 'react';
import type { StructuredPlan } from '../types/travel.ts';

interface TripPlanProps {
  plan: StructuredPlan;
  isDraft?: boolean;
}

function hasText(value?: string) {
  return Boolean(value && value.trim());
}

function Section({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/8 bg-white/4 p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-400/15 text-sm">
          {icon}
        </span>
        <h3 className="font-display text-base tracking-tight text-white">{title}</h3>
      </div>
      {children}
    </section>
  );
}

export function TripPlan({ plan, isDraft = false }: TripPlanProps) {
  const summary = plan.trip_summary;
  const flights = plan.flights;
  const weather = plan.weather;
  const budget = plan.budget;
  const summaryItems = [
    { label: 'From', value: summary?.origin },
    { label: 'To', value: summary?.destination },
    { label: 'Duration', value: summary?.duration },
    { label: 'Style', value: summary?.travel_style },
  ].filter((item) => hasText(item.value));

  return (
    <div className="space-y-4 text-slate-200">
      {(plan.headline || isDraft) && (
        <div className="space-y-2">
          {isDraft && (
            <span className="inline-flex rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-200">
              Draft itinerary
            </span>
          )}
          {plan.headline && (
            <h2 className="font-display text-2xl leading-tight text-white sm:text-[1.7rem]">
              {plan.headline}
            </h2>
          )}
          {plan.overview && (
            <p className="text-sm leading-relaxed text-slate-300 sm:text-[15px]">
              {plan.overview}
            </p>
          )}
        </div>
      )}

      {plan.highlights && plan.highlights.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {plan.highlights.map((item) => (
            <span
              key={item}
              className="rounded-full border border-teal-300/20 bg-teal-400/10 px-3 py-1 text-xs text-teal-100"
            >
              {item}
            </span>
          ))}
        </div>
      )}

      {summaryItems.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {summaryItems.map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-white/8 bg-navy-900/40 px-3 py-2.5"
            >
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">
                {item.label}
              </p>
              <p className="mt-1 text-sm font-medium text-white">{item.value}</p>
            </div>
          ))}
        </div>
      )}

      {summary?.best_for && (
        <p className="text-sm text-slate-300">
          Best for: <span className="text-white">{summary.best_for}</span>
        </p>
      )}

      {flights && (flights.summary || flights.route) && (
        <Section icon="✈" title="Getting there">
          {flights.route && (
            <p className="mb-2 text-sm font-medium text-white">{flights.route}</p>
          )}
          {flights.summary && (
            <p className="text-sm leading-relaxed text-slate-300">{flights.summary}</p>
          )}
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {flights.duration && (
              <p className="rounded-lg bg-white/5 px-3 py-2 text-xs text-slate-300">
                Duration: <span className="text-white">{flights.duration}</span>
              </p>
            )}
            {flights.price_range && (
              <p className="rounded-lg bg-white/5 px-3 py-2 text-xs text-slate-300">
                Fares: <span className="text-white">{flights.price_range}</span>
              </p>
            )}
            {flights.airlines && flights.airlines.length > 0 && (
              <p className="rounded-lg bg-white/5 px-3 py-2 text-xs text-slate-300">
                Airlines: <span className="text-white">{flights.airlines.join(', ')}</span>
              </p>
            )}
          </div>
          {flights.tips && flights.tips.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm text-slate-300">
              {flights.tips.map((tip) => (
                <li key={tip}>• {tip}</li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {plan.hotels && plan.hotels.length > 0 && (
        <Section icon="🏨" title="Places to stay">
          <div className="grid gap-3">
            {plan.hotels.map((hotel) => (
              <article
                key={`${hotel.name}-${hotel.area}`}
                className="rounded-xl border border-white/8 bg-white/4 p-3.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-medium text-white">{hotel.name}</h4>
                    {hotel.area && (
                      <p className="mt-0.5 text-xs uppercase tracking-[0.14em] text-teal-200/80">
                        {hotel.area}
                      </p>
                    )}
                  </div>
                  {hotel.price_range && (
                    <span className="shrink-0 rounded-full bg-amber-300/10 px-2 py-1 text-[11px] text-amber-200">
                      {hotel.price_range}
                    </span>
                  )}
                </div>
                {hotel.why && (
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">{hotel.why}</p>
                )}
              </article>
            ))}
          </div>
        </Section>
      )}

      {weather && (weather.summary || weather.forecast) && (
        <Section icon="☀" title="Weather & packing">
          {weather.summary && (
            <p className="text-sm leading-relaxed text-slate-300">{weather.summary}</p>
          )}
          {weather.forecast && (
            <p className="mt-2 text-sm text-slate-300">{weather.forecast}</p>
          )}
          {weather.packing_tips && weather.packing_tips.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {weather.packing_tips.map((tip) => (
                <span
                  key={tip}
                  className="rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-slate-200"
                >
                  {tip}
                </span>
              ))}
            </div>
          )}
        </Section>
      )}

      {plan.itinerary && plan.itinerary.length > 0 && (
        <Section icon="🗓" title="Day by day">
          <div className="space-y-3">
            {plan.itinerary.map((day) => (
              <article
                key={`${day.day}-${day.title}`}
                className="relative rounded-xl border border-white/8 bg-navy-900/30 p-3.5 pl-4"
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded-full bg-teal-400/20 px-2 py-0.5 text-[11px] font-semibold text-teal-100">
                    Day {day.day}
                  </span>
                  {day.title && <p className="font-medium text-white">{day.title}</p>}
                </div>
                <div className="space-y-1.5 text-sm text-slate-300">
                  {day.morning && <p><span className="text-slate-400">Morning:</span> {day.morning}</p>}
                  {day.afternoon && <p><span className="text-slate-400">Afternoon:</span> {day.afternoon}</p>}
                  {day.evening && <p><span className="text-slate-400">Evening:</span> {day.evening}</p>}
                  {day.tips && <p className="text-teal-100/90">Tip: {day.tips}</p>}
                </div>
              </article>
            ))}
          </div>
        </Section>
      )}

      {budget && (budget.total_estimate || budget.breakdown?.length) && (
        <Section icon="💰" title="Budget snapshot">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {budget.total_estimate && (
              <p className="text-lg font-medium text-white">{budget.total_estimate}</p>
            )}
            {typeof budget.feasible === 'boolean' && (
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                  budget.feasible
                    ? 'bg-emerald-400/15 text-emerald-200'
                    : 'bg-rose-400/15 text-rose-200'
                }`}
              >
                {budget.feasible ? 'Looks realistic' : 'May stretch the budget'}
              </span>
            )}
          </div>
          {budget.breakdown && budget.breakdown.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {budget.breakdown.map((item) => (
                <div key={item.category} className="rounded-lg bg-white/5 px-3 py-2">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-400">
                    {item.category}
                  </p>
                  <p className="mt-1 text-sm text-white">{item.amount || 'Estimate varies'}</p>
                  {item.notes && <p className="mt-1 text-xs text-slate-400">{item.notes}</p>}
                </div>
              ))}
            </div>
          )}
          {budget.saving_tips && budget.saving_tips.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm text-slate-300">
              {budget.saving_tips.map((tip) => (
                <li key={tip}>• {tip}</li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {plan.recommendations && plan.recommendations.length > 0 && (
        <Section icon="✨" title="Before you go">
          <ul className="space-y-2 text-sm leading-relaxed text-slate-300">
            {plan.recommendations.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
