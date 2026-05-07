import { Link } from 'react-router-dom';

export default function StatCard({ name, label, icon, count }) {
  return (
    <Link
      to={`/collections/${name}`}
      className="bg-vs-card rounded-xl border border-vs-border p-5 hover:border-vs-purple hover:bg-vs-elevated transition-all group"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-vs-text-3 font-medium">{label}</p>
          <p className="text-3xl font-bold text-vs-text mt-1">
            {count.toLocaleString()}
          </p>
        </div>
        <span className="text-2xl">{icon}</span>
      </div>
      <p className="mt-3 text-xs text-vs-purple-light group-hover:text-vs-purple font-medium transition-colors">
        View collection →
      </p>
    </Link>
  );
}
