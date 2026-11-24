/** 下拉选择（地图等） */
export default function SelectField({ value, onChange, options, placeholder }) {
  return (
    <select className="sm-select" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
