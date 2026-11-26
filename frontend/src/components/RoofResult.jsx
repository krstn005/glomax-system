import './roof-map.css';

// Shows the result of the roof assessment (from roof_engine.py).
//   result = the calculation: { suitability_score, suitability_rating,
//            suitability_text, recommended_package_kw, steps: [...], ... }
//   stale  = true when the roof outline or the details were changed after
//            the last Calculate, so the numbers may be old.
//   title  = heading of the card
// The styles are in roof-map.css (the rr- classes).

function peso(value) {
  const n = Number(value);
  if (value === null || value === undefined || value === '' || Number.isNaN(n)) return '—';
  return `₱${n.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
}

function amount(value, unit = '', digits = 1) {
  const n = Number(value);
  if (value === null || value === undefined || value === '' || Number.isNaN(n)) return '—';
  return `${n.toLocaleString('en-PH', { maximumFractionDigits: digits })}${unit}`;
}

export default function RoofResult({ result, stale = false, title = 'Roof assessment result' }) {
  if (!result || !Array.isArray(result.steps)) return null;

  const score = Math.max(0, Math.min(100, Math.round(Number(result.suitability_score) || 0)));
  const rating = String(result.suitability_rating || 'LOW').toLowerCase();
  const scoreTone = rating === 'high' ? '' : rating; // green is the default look
  const packageKw = result.recommended_package_kw;

  const stats = [
    ['Roof area', amount(result.roof_area_sqm, ' sq.m')],
    ['Usable area', amount(result.usable_area_sqm, ' sq.m')],
    ['Panels that fit', amount(result.max_panels, ' pcs', 0)],
    ['Recommended package', packageKw ? `${packageKw} kW` : 'None fits'],
    ['Panels needed', amount(result.panels, ' pcs', 0)],
    ['Energy per year', amount(result.annual_kwh, ' kWh', 0)],
    ['Savings per month', peso(result.monthly_savings)],
    ['Payback', amount(result.payback_years, ' years')],
  ];

  return (
    <section className="rr-card" aria-label={title}>
      {stale && (
        <p className="rr-stale" role="status">
          You changed the roof outline or the details. Press Calculate again to update this result.
        </p>
      )}

      <div className="rr-head">
        <div className={`rr-score ${scoreTone}`}>
          <strong>{score}</strong>
          <small>out of 100</small>
        </div>
        <div className="rr-head-text">
          <h3>{title}</h3>
          <p>
            {result.suitability_text || 'Suitability'}
            {packageKw ? ` · Suggested package: ${packageKw} kW` : ''}
            {result.sun_hours_source ? ` · Sun data: ${result.sun_hours_source}` : ''}
          </p>
        </div>
      </div>

      <div className="rr-stats">
        {stats.map(([label, value]) => (
          <div key={label} className="rr-stat">
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>

      <p className="rr-steps-title">How this was worked out</p>
      <ol className="rr-steps">
        {result.steps.map((step, index) => (
          <li key={step.key || index}>
            <span className="rr-num">{index + 1}</span>
            <div>
              <div className="rr-step-label">
                <span>{step.label}</span>
                <span>{step.value}</span>
              </div>
              {step.note && <p className="rr-step-note">{step.note}</p>}
            </div>
          </li>
        ))}
      </ol>

      {!packageKw && (
        <p className="rr-warn">
          No package fits this roof. Check the outline, or tell Staff that the roof may not be compatible.
        </p>
      )}
    </section>
  );
}