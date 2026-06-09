import { useEffect, useState } from 'react';
import { services, type Service, type ServiceStatus } from './api';

// Small colored dot per tile — UP green, DOWN red, DEGRADED amber, UNKNOWN gray.
const statusDot: Record<ServiceStatus, string> = {
  UP: 'bg-emerald-500',
  DOWN: 'bg-red-500',
  DEGRADED: 'bg-amber-400',
  UNKNOWN: 'bg-neutral-300',
};

export default function Catalog() {
  const [items, setItems] = useState<Service[] | null>(null);

  useEffect(() => {
    services().then(setItems);
  }, []);

  if (items === null) {
    return <p className="text-sm text-neutral-400">loading services…</p>;
  }
  if (items.length === 0) {
    return (
      <p className="text-sm text-neutral-400">
        No services in the catalog yet — an admin can add them.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
      {items.map((s) => (
        <ServiceTile key={s.id} service={s} />
      ))}
    </div>
  );
}

function ServiceTile({ service }: { service: Service }) {
  const icon = `https://cdn.jsdelivr.net/gh/selfhst/icons/svg/${service.icon || 'cog'}.svg`;
  return (
    <div
      data-testid="service-tile"
      className="relative rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <span
        data-testid="status-badge"
        data-status={service.status}
        title={service.status}
        aria-label={`status: ${service.status}`}
        className={`absolute right-3 top-3 h-2.5 w-2.5 rounded-full ${statusDot[service.status] ?? statusDot.UNKNOWN}`}
      />
      <a
        href={service.url}
        target="_blank"
        rel="noreferrer noopener"
        className="flex flex-col rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <img
          data-testid="service-tile-icon"
          src={icon}
          alt=""
          className="h-12 w-12 rounded-lg object-contain"
        />
        <span data-testid="service-tile-name" className="mt-3 truncate font-semibold text-neutral-800">
          {service.name}
        </span>
        <span
          data-testid="service-tile-description"
          className="mt-0.5 truncate text-sm text-neutral-500"
        >
          {service.description}
        </span>
      </a>
    </div>
  );
}
