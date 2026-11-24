/** 分段控件（全部 / 有载具 / 无载具） */
export default function SegmentedPills({ value, options, onChange }) {
  return (
    <div className="sm-pills">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`sm-pill${value === o.value ? ' is-active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
