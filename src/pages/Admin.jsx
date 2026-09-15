// Path: src/pages/Admin.jsx
import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  BadgeCheck,
  Briefcase,
  ClipboardList,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react'
import { api } from '../lib/api.js'

const TABS = [
  { id: 'users', label: 'Users' },
  { id: 'hats', label: 'Hats' },
  { id: 'applications', label: 'Applications' },
  { id: 'escrows', label: 'Escrows' },
  { id: 'wallet', label: 'Wallet' },
  { id: 'audit', label: 'Audit' },
]

const STATUS_STYLE = {
  active: 'bg-[#E8FFE6] text-[#0A7A00]',
  inactive: 'bg-red-50 text-red-600',
  pending: 'bg-[#FFF6DB] text-[#8A6D00]',
  success: 'bg-[#E8FFE6] text-[#0A7A00]',
  accepted: 'bg-[#E8FFE6] text-[#0A7A00]',
  secured: 'bg-[#E8FFE6] text-[#0A7A00]',
  released: 'bg-[#EDEBFF] text-[#3B2FD9]',
  rejected: 'bg-red-50 text-red-600',
  failed: 'bg-red-50 text-red-600',
  cancelled: 'bg-red-50 text-red-600',
  withdrawn: 'bg-[#F5F3EF] text-black/50',
  not_funded: 'bg-[#FFF6DB] text-[#8A6D00]',
}

const MONEY_TYPES = new Set(['topup', 'escrow_release', 'refund'])

function fmtMoney(n) {
  if (n == null) return '₦0'
  try {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n)
  } catch {
    return `₦${Number(n || 0).toLocaleString()}`
  }
}

function fmtDate(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return '—'
  }
}

function cleanLabel(value) {
  return String(value || '—').replace(/_/g, ' ')
}

function shortId(value) {
  if (!value) return '—'
  return String(value).slice(0, 8)
}

function searchable(value) {
  if (value == null) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export default function Admin() {
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [tab, setTab] = useState('users')
  const [query, setQuery] = useState('')

  async function load() {
    setError('')
    setLoading(true)
    try {
      const data = await api.getAdminDashboard()
      setDashboard(data)
    } catch (err) {
      setError(err.message || 'Failed to load admin dashboard.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const lists = dashboard?.lists || {}
  const metrics = dashboard?.metrics || {}

  const filtered = useMemo(() => {
    const source =
      tab === 'wallet'
        ? lists.walletTransactions || []
        : tab === 'audit'
          ? lists.auditLogs || []
          : lists[tab] || []
    const needle = query.trim().toLowerCase()
    if (!needle) return source
    return source.filter((item) =>
      Object.values(item).some((value) => searchable(value).toLowerCase().includes(needle)),
    )
  }, [lists, query, tab])

  async function runAction(key, payload, message) {
    if (message && !confirm(message)) return
    setBusy(key)
    try {
      await api.adminAction(payload)
      await load()
    } catch (err) {
      alert(err.message || 'Admin action failed.')
    } finally {
      setBusy('')
    }
  }

  if (loading && !dashboard) {
    return <p className="text-center text-black/40 py-16 text-[13px] font-medium">Loading admin panel…</p>
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[#0A13E6]">
            <ShieldCheck size={16} />
            <span className="text-[11px] font-bold tracking-widest uppercase">Operations</span>
          </div>
          <h1 className="text-[22px] font-bold tracking-tight mt-1">Admin Panel</h1>
          <p className="text-[12px] text-black/50 font-medium mt-0.5">
            Monitor users, hats, bookings, applications, wallet activity, and support actions.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="h-10 px-4 rounded-full border-[1.5px] border-black bg-white text-[12px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-[12px] border-[1.5px] border-red-200 bg-red-50 px-4 py-2.5 text-[13px] font-medium text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Metric icon={Users} label="Users" value={metrics.users} />
        <Metric icon={Briefcase} label="Active Hats" value={metrics.active_hats} sub={`${metrics.hats || 0} total`} />
        <Metric icon={ClipboardList} label="Applications" value={metrics.applications} />
        <Metric icon={Activity} label="Escrows" value={metrics.escrows} />
        <Metric icon={Wallet} label="Wallet Liability" value={fmtMoney(metrics.wallet_liability)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <StatusSummary title="Applications" rows={dashboard?.statusCounts?.applications || []} />
        <StatusSummary title="Escrows" rows={dashboard?.statusCounts?.escrows || []} money />
        <WalletSummary rows={dashboard?.statusCounts?.wallet || []} />
      </div>

      <div className="bg-white rounded-[20px] border-[1.5px] border-black overflow-hidden">
        <div className="p-3 border-b border-black/10 flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
          <div className="flex gap-2 overflow-x-auto pb-1 lg:pb-0">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`h-9 px-3 rounded-full border-[1.5px] text-[12px] font-semibold whitespace-nowrap transition ${
                  tab === item.id
                    ? 'bg-[#0A13E6] border-black text-white'
                    : 'bg-white border-black/10 text-black/60 hover:border-black hover:text-black'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="relative lg:w-72">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/35" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search this table…"
              className="w-full h-10 pl-9 pr-3 rounded-full border-[1.5px] border-black/10 bg-[#F7F3EB] text-[13px] font-medium outline-none focus:border-black/20"
            />
          </div>
        </div>

        {tab === 'users' && <UsersTable rows={filtered} />}
        {tab === 'hats' && <HatsTable rows={filtered} busy={busy} runAction={runAction} />}
        {tab === 'applications' && <ApplicationsTable rows={filtered} busy={busy} runAction={runAction} />}
        {tab === 'escrows' && <EscrowsTable rows={filtered} busy={busy} runAction={runAction} />}
        {tab === 'wallet' && <WalletTable rows={filtered} busy={busy} runAction={runAction} />}
        {tab === 'audit' && <AuditTable rows={filtered} />}
      </div>
    </div>
  )
}

function Metric({ icon: Icon, label, value, sub }) {
  return (
    <div className="bg-white rounded-[16px] border-[1.5px] border-black p-4 min-h-[112px]">
      <div className="flex items-center gap-2 text-black/45">
        <Icon size={14} />
        <span className="text-[10px] font-bold tracking-widest uppercase">{label}</span>
      </div>
      <p className="text-[24px] font-bold tracking-tight mt-3">{value ?? 0}</p>
      {sub && <p className="text-[11px] text-black/40 font-medium mt-1">{sub}</p>}
    </div>
  )
}

function StatusSummary({ title, rows, money }) {
  return (
    <div className="bg-white rounded-[16px] border-[1.5px] border-black p-4">
      <h2 className="text-[13px] font-bold tracking-tight mb-3">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-[12px] text-black/40 font-medium">No records yet.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.status} className="flex items-center justify-between gap-3 text-[12px]">
              <StatusPill status={row.status} />
              <span className="font-bold">{money ? fmtMoney(row.amount) : row.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function WalletSummary({ rows }) {
  return (
    <div className="bg-white rounded-[16px] border-[1.5px] border-black p-4">
      <h2 className="text-[13px] font-bold tracking-tight mb-3">Wallet Flow</h2>
      {rows.length === 0 ? (
        <p className="text-[12px] text-black/40 font-medium">No wallet activity yet.</p>
      ) : (
        <div className="space-y-2 max-h-[126px] overflow-y-auto pr-1">
          {rows.map((row) => (
            <div key={`${row.type}-${row.status}`} className="flex items-center justify-between gap-3 text-[12px]">
              <span className="font-semibold text-black/65">
                {cleanLabel(row.type)} · {cleanLabel(row.status)}
              </span>
              <span className="font-bold">{fmtMoney(row.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function UsersTable({ rows }) {
  return (
    <Table empty="No users found." rowCount={rows.length}>
      <thead>
        <tr>
          <Th>User</Th>
          <Th>Role</Th>
          <Th>Hats</Th>
          <Th>Wallet</Th>
          <Th>Admin</Th>
          <Th>Joined</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((u) => (
          <tr key={u.id} className="border-t border-black/10">
            <Td>
              <p className="font-bold">@{u.username}</p>
              <p className="text-black/40">{u.email}</p>
              <p className="text-black/35">{[u.lga, u.country].filter(Boolean).join(', ') || '—'}</p>
            </Td>
            <Td>
              <StatusPill status={u.role} />
            </Td>
            <Td>{u.hats_count}</Td>
            <Td>{fmtMoney(u.wallet_balance)}</Td>
            <Td>{u.is_admin ? <BadgeCheck size={16} className="text-[#0A13E6]" /> : '—'}</Td>
            <Td>{fmtDate(u.created_at)}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  )
}

function HatsTable({ rows, busy, runAction }) {
  return (
    <Table empty="No hats found." rowCount={rows.length}>
      <thead>
        <tr>
          <Th>Hat</Th>
          <Th>Role</Th>
          <Th>Score</Th>
          <Th>Activity</Th>
          <Th>Status</Th>
          <Th>Created</Th>
          <Th>Action</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((h) => (
          <tr key={h.id} className="border-t border-black/10">
            <Td>
              <p className="font-bold">{h.hat_title}</p>
              <p className="text-black/40">@{h.username} · {h.category}</p>
              <p className="text-black/35">{h.media_count} media</p>
            </Td>
            <Td>
              <StatusPill status={h.role} />
            </Td>
            <Td>{h.orbit_score || 0}</Td>
            <Td>
              <p>{h.views || 0} views</p>
              <p className="text-black/40">{h.likes || 0} likes · {h.bookings || 0} bookings</p>
            </Td>
            <Td>
              <StatusPill status={h.active ? 'active' : 'inactive'} />
            </Td>
            <Td>{fmtDate(h.created_at)}</Td>
            <Td>
              <ActionButton
                disabled={busy === `hat-${h.id}`}
                danger={h.active}
                onClick={() =>
                  runAction(
                    `hat-${h.id}`,
                    { action: 'set_hat_active', hatId: h.id, active: !h.active },
                    `${h.active ? 'Deactivate' : 'Reactivate'} "${h.hat_title}"?`,
                  )
                }
              >
                {h.active ? 'Deactivate' : 'Reactivate'}
              </ActionButton>
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  )
}

function ApplicationsTable({ rows, busy, runAction }) {
  return (
    <Table empty="No applications found." rowCount={rows.length}>
      <thead>
        <tr>
          <Th>Application</Th>
          <Th>Status</Th>
          <Th>Message</Th>
          <Th>Updated</Th>
          <Th>Actions</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((a) => (
          <tr key={a.id} className="border-t border-black/10">
            <Td>
              <p className="font-bold">@{a.applicant_username}</p>
              <p className="text-black/40">{a.hat_title}</p>
              <p className="text-black/35">Owner @{a.hat_owner_username}</p>
            </Td>
            <Td>
              <StatusPill status={a.status} />
            </Td>
            <Td className="max-w-[280px]">
              <p className="line-clamp-2">{a.message || '—'}</p>
            </Td>
            <Td>{fmtDate(a.updated_at || a.created_at)}</Td>
            <Td>
              <div className="flex flex-wrap gap-2">
                {['accepted', 'rejected', 'withdrawn', 'pending'].map((status) => (
                  <ActionButton
                    key={status}
                    disabled={busy === `application-${a.id}` || a.status === status}
                    danger={status === 'rejected' || status === 'withdrawn'}
                    onClick={() =>
                      runAction(
                        `application-${a.id}`,
                        { action: 'set_application_status', applicationId: a.id, status },
                        `Set this application to ${status}?`,
                      )
                    }
                  >
                    {cleanLabel(status)}
                  </ActionButton>
                ))}
              </div>
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  )
}

function EscrowsTable({ rows, busy, runAction }) {
  return (
    <Table empty="No escrows found." rowCount={rows.length}>
      <thead>
        <tr>
          <Th>Booking</Th>
          <Th>Parties</Th>
          <Th>Amount</Th>
          <Th>Status</Th>
          <Th>Reference</Th>
          <Th>Created</Th>
          <Th>Action</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((e) => (
          <tr key={e.id} className="border-t border-black/10">
            <Td>
              <p className="font-bold">{e.hat_title || 'Deleted hat'}</p>
              <p className="text-black/35">#{shortId(e.id)}</p>
            </Td>
            <Td>
              <p>Client @{e.client_username || '—'}</p>
              <p className="text-black/40">Talent @{e.talent_username || '—'}</p>
            </Td>
            <Td>{fmtMoney(e.amount)}</Td>
            <Td>
              <StatusPill status={e.status} />
            </Td>
            <Td className="max-w-[220px]">
              <p className="truncate">{e.payment_reference || '—'}</p>
            </Td>
            <Td>{fmtDate(e.created_at)}</Td>
            <Td>
              {e.status === 'not_funded' ? (
                <ActionButton
                  disabled={busy === `escrow-${e.id}`}
                  danger
                  onClick={() =>
                    runAction(
                      `escrow-${e.id}`,
                      { action: 'cancel_unfunded_escrow', escrowId: e.id },
                      'Cancel this unfunded escrow?',
                    )
                  }
                >
                  Cancel
                </ActionButton>
              ) : (
                <span className="text-black/35">—</span>
              )}
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  )
}

function WalletTable({ rows, busy, runAction }) {
  return (
    <Table empty="No wallet transactions found." rowCount={rows.length}>
      <thead>
        <tr>
          <Th>User</Th>
          <Th>Type</Th>
          <Th>Amount</Th>
          <Th>Balance After</Th>
          <Th>Status</Th>
          <Th>Reference</Th>
          <Th>Date</Th>
          <Th>Action</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((t) => {
          const credit = MONEY_TYPES.has(t.type)
          return (
            <tr key={t.id} className="border-t border-black/10">
              <Td>@{t.username || '—'}</Td>
              <Td>{cleanLabel(t.type)}</Td>
              <Td className={credit ? 'text-green-700 font-bold' : 'font-bold'}>
                {credit ? '+' : '-'}
                {fmtMoney(t.amount)}
              </Td>
              <Td>{fmtMoney(t.balance_after)}</Td>
              <Td>
                <StatusPill status={t.status} />
              </Td>
              <Td className="max-w-[240px]">
                <p className="truncate">{t.reference || '—'}</p>
              </Td>
              <Td>{fmtDate(t.created_at)}</Td>
              <Td>
                {t.type === 'withdrawal' ? (
                  <div className="flex flex-wrap gap-2">
                    {['pending', 'success', 'failed'].map((status) => (
                      <ActionButton
                        key={status}
                        disabled={busy === `withdrawal-${t.id}` || t.status === status}
                        danger={status === 'failed'}
                        onClick={() =>
                          runAction(
                            `withdrawal-${t.id}`,
                            { action: 'set_withdrawal_status', transactionId: t.id, status },
                            `Mark this withdrawal as ${status}? This updates status only.`,
                          )
                        }
                      >
                        {status}
                      </ActionButton>
                    ))}
                  </div>
                ) : (
                  <span className="text-black/35">—</span>
                )}
              </Td>
            </tr>
          )
        })}
      </tbody>
    </Table>
  )
}

function AuditTable({ rows }) {
  return (
    <Table empty="No audit logs yet." rowCount={rows.length}>
      <thead>
        <tr>
          <Th>Admin</Th>
          <Th>Action</Th>
          <Th>Target</Th>
          <Th>Metadata</Th>
          <Th>Date</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((log) => (
          <tr key={log.id} className="border-t border-black/10">
            <Td>@{log.admin_username || 'unknown'}</Td>
            <Td>{cleanLabel(log.action)}</Td>
            <Td>
              <p>{cleanLabel(log.target_type)}</p>
              <p className="text-black/35">#{shortId(log.target_id)}</p>
            </Td>
            <Td className="max-w-[320px]">
              <p className="truncate">{JSON.stringify(log.metadata || {})}</p>
            </Td>
            <Td>{fmtDate(log.created_at)}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  )
}

function Table({ children, empty, rowCount }) {
  if (!rowCount) {
    return (
      <div className="p-8 text-center">
        <p className="text-[13px] text-black/45 font-medium">{empty}</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[920px] w-full text-left text-[12px]">
        {children}
      </table>
    </div>
  )
}

function Th({ children }) {
  return (
    <th className="px-4 py-3 bg-[#F7F3EB] text-[10px] font-bold tracking-widest uppercase text-black/50">
      {children}
    </th>
  )
}

function Td({ children, className = '' }) {
  return <td className={`px-4 py-3 align-top font-medium text-black/70 ${className}`}>{children}</td>
}

function StatusPill({ status }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${
        STATUS_STYLE[status] || 'bg-[#F5F3EF] text-black/55'
      }`}
    >
      {cleanLabel(status)}
    </span>
  )
}

function ActionButton({ children, disabled, danger, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`h-8 px-3 rounded-full border-[1.5px] text-[11px] font-semibold capitalize transition disabled:opacity-40 ${
        danger
          ? 'border-red-200 bg-red-50 text-red-600 hover:border-red-400'
          : 'border-black/10 bg-white text-black/60 hover:border-black hover:text-black'
      }`}
    >
      {children}
    </button>
  )
}