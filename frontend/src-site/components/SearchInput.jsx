/** 搜索输入框（带一键清除） */
export default function SearchInput({ value, onChange, placeholder }) {
  return (
    <div className="sm-search">
      <input
        className="sm-input"
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {value ? (
        <button type="button" className="sm-clear" onClick={() => onChange('')} aria-label="清除">
          ×
        </button>
      ) : null}
    </div>
  )
}
