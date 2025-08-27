export default function Profile() {
  const card = 'bg-white rounded-2xl shadow-card p-6';

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Profile</h1>
      <section className={card}>
        <p className="text-gray-600">Placeholder for user profile details.</p>
      </section>
    </div>
  );
}
