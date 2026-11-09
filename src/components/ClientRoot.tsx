"use client";

import dynamic from "next/dynamic";

// The app depends on browser-only APIs (Google Maps, localStorage, the URL hash), so it renders on the client.
const SettleApp = dynamic(() => import("./SettleApp"), { ssr: false, loading: () => <div className="app" /> });

export default function ClientRoot() {
  return <SettleApp />;
}
