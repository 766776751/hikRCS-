/** 空状态提示 */
export default function EmptyState({ text = '暂无数据' }) {
  return <div className="sm-empty">{text}</div>
}
