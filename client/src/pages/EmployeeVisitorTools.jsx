import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiCalendar, FiExternalLink } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../services/api';
import PageHead from '../components/common/PageHead';
import StatusBadge from '../components/common/StatusBadge';

const tomorrow = () => {
  const date = new Date(Date.now() + 86400000);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
};

export default function EmployeeVisitorTools() {
  const [items, setItems] = useState([]);
  const [dates, setDates] = useState({});
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/visitors', { params: { limit: 100, sortBy: 'visitDate', sortOrder: 'desc' } });
      setItems(response.data);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (visitor) => {
    const date = dates[visitor._id];
    if (!date) return toast.error('Choose the next visiting date');
    setBusy(visitor._id);
    try {
      const response = await api.post(`/visitors/${visitor._id}/next-visit`, { nextVisitDate: date });
      toast.success(response.message);
      await load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy('');
    }
  };

  return <main className="page">
    <PageHead eyebrow="Employee visitor desk" title="My visitors and passes" description="View assigned visitor passes and send a confirmed next visiting date to the visitor."/>
    <section className="data-card"><div className="table-scroll"><table className="data-table">
      <thead><tr><th>Visitor</th><th>Visit</th><th>Status</th><th>Pass</th><th>Next visiting date</th></tr></thead>
      <tbody>{loading
        ? <tr><td colSpan="5">Loading your assigned visitors...</td></tr>
        : items.length ? items.map((visitor) => <tr key={visitor._id}>
          <td><b>{visitor.visitorName}</b><small>{visitor.email}</small></td>
          <td>{new Date(visitor.visitDate).toLocaleDateString()}<small>{visitor.expectedArrival} - {visitor.expectedDeparture}</small></td>
          <td><StatusBadge status={visitor.status}/></td>
          <td>{['approved', 'checked_in', 'checked_out'].includes(visitor.status)
            ? <Link className="secondary" to={`/visitors/${visitor._id}/pass`}><FiExternalLink/>View pass</Link>
            : 'Available after approval'}</td>
          <td><div className="row-actions">
            <input type="date" min={tomorrow()} value={dates[visitor._id] || ''} onChange={(event) => setDates((value) => ({ ...value, [visitor._id]: event.target.value }))}/>
            <button className="secondary" disabled={busy === visitor._id} onClick={() => save(visitor)}><FiCalendar/>Send date</button>
          </div>{visitor.nextVisitDate && <small>Current: {new Date(visitor.nextVisitDate).toLocaleDateString()}</small>}</td>
        </tr>) : <tr><td colSpan="5">No visitor records are assigned to you.</td></tr>}
      </tbody>
    </table></div></section>
  </main>;
}
