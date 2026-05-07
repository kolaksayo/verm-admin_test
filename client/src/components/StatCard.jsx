import { Link } from 'react-router-dom';

export default function StatCard({ name, label, icon, count }) {
  return (
    <Link
      to={`/collections/${name}`}
      className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-blue-300 transition-all group"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{label}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">
            {count.toLocaleString()}
          </p>
        </div>
        <span className="text-2xl">{icon}</span>
      </div>
      <p className="mt-3 text-xs text-blue-500 group-hover:text-blue-600 font-medium">
        View collection →
      </p>
    </Link>
  );
}
