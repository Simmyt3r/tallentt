// Path: src/pages/Admin.jsx
import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  BadgeCheck,
  Briefcase,
  ClipboardList,
  FileText,
  Gavel,
  Handshake,
  LayoutDashboard,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react'
import { api } from '../lib/api.js'
import AdminDisputes from '../components/AdminDisputes.jsx'
import UserIdentity from '../components/UserIdentity'
import { identityFromHat, identityFromRow, resolveIdentity } from '../lib/profile.js'

const SECTIONS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'deals', label: 'Deals & Escrow', icon: Handshake },
  { id: 'finance', label: 'Finance', icon: Wallet },
  { id: 'disputes', label: 'Disputes', icon: Gavel },
  { id: 'hats', label: 'Hats', icon: Briefcase },
  { id: 'applications', label: 'Applications', icon: ClipboardList },
  { id: 'audit', label: 'Audit Log', icon: FileText },
]

const SEARCHABLE_TABS = new Set(['users', 'deals', 'finance', 'hats', 'applications', 'audit'])

const STATUS_STYLE = {
  active: 'bg-[#E8FFE6] text-[#0A7A00]',
  inactive: 'bg-red-50 text-red-600',
  pending: 'bg-[#FFF6DB] text-[#8A6D00]',
  success: 'bg-[#E8FFE6] text-[#0A7A00]',
  accepted: 'bg-[#E8FFE6] text-[#0A7A00]',
  secured: 'bg-[#E8FFE6] text-[#0A7A00]',
  released: 'bg-[#EDEBFF] text-[#3B2FD9]',
  refunded: 'bg-[#FFF6DB] text-[#8A6D00]',
  rejected: 'bg-red-50 text-red-600',
  failed: 'bg-red-50 text-red-600',
  cancelled: 'bg-red-50 text-red-600',
  withdrawn: 'bg-[#F5F3EF] text-black/50',
  not_funded: 'bg-[#FFF6DB] text-[#8A6D00]',
  awaiting_start: 'bg-[#FFF6DB] text-[#8A6D00]',
  in_progress: 'bg-blue-50 text-blue-700',
  submitted: 'bg-violet-50 text-violet-700',
  revision_requested: 'bg-orange-50 text-orange-700',
  awaiting_completion: 'bg-cyan-50 text-cyan-700',
  disputed: 'bg-red-50 text-red-700',
  completed: 'bg-[#E8FFE6] text-[#0A7A00]',
}

const MONEY_TYPES = new Set(['topup', 'escrow_start', 'escrow_release', 'refund'])

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
  const [tab, setTab] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('tab')
    return SECTIONS.some((item) => item.id === requested) ? requested : 'overview'
  })
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    params.set('tab', tab)
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`)
    setQuery('')
  }, [tab])

  const lists = dashboard?.lists || {}
  const metrics = dashboard?.metrics || {}

  const filtered = useMemo(() => {
    const key = {
      users: 'users',
      deals: 'escrows',
      finance: 'walletTransactions',
      hats: 'hats',
      applications: 'applications',
      audit: 'auditLogs',
    }[tab]
    const source = key ? lists[key] || [] : []
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
    return <p className="text-center text-black/40 py-16 text-[13px] font-medium">Loading admin command center…</p>
  }

  const activeSection = SECTIONS.find((item) => item.id === tab) || SECTIONS[0]

  return (
    <div className="space-y-4 pb-8">
      <header className="rounded-[22px] border-[1.5px] border-black bg-white p-4 md:p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[#0A13E6]">
              <ShieldCheck size={16} />
              <span className="text-[11px] font-bold tracking-widest uppercase">ChombuTar Operations</span>
            </div>
            <h1 className="text-[24px] md:text-[28px] font-bold tracking-tight mt-1">Admin Command Center</h1>
            <p className="text-[12px] text-black/50 font-medium mt-1 max-w-2xl">
              Users, deal settlement, money movement, moderation and operational evidence in one place.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {dashboard?.admin?.username && (
              <span className="hidden sm:inline-flex h-10 items-center rounded-full bg-[#F7F3EB] px-4 text-[11px] font-bold">
                @{dashboard.admin.username}
              </span>
            )}
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
        </div>
      </header>

      {error && (
        <div className="rounded-[14px] border-[1.5px] border-red-200 bg-red-50 px-4 py-3 text-[13px] font-medium text-red-700">
          {error}
        </div>
      )}

      <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-4">
        <aside className="mb-4 lg:mb-0">
          <nav className="lg:sticky lg:top-4 flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0">
            {SECTIONS.map((item) => {
              const Icon = item.icon
              const active = tab === item.id
              const badge =
                item.id === 'disputes'
                  ? metrics.open_disputes
                  : item.id === 'finance'
                    ? metrics.pending_withdrawals
                    : null
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`min-w-fit lg:w-full h-11 px-3.5 rounded-[14px] border-[1.5px] text-[12px] font-semibold transition flex items-center gap-2.5 ${
                    active
                      ? 'bg-[#0A13E6] border-black text-white shadow-[2px_2px_0_#000]'
                      : 'bg-white border-black/10 text-black/60 hover:border-black/30 hover:text-black'
                  }`}
                >
                  <Icon size={15} />
                  <span className="whitespace-nowrap">{item.label}</span>
                  {Number(badge) > 0 && (
                    <span className={`ml-auto min-w-5 h-5 px-1.5 rounded-full grid place-items-center text-[9px] font-bold ${
                      active ? 'bg-white text-[#0A13E6]' : 'bg-red-50 text-red-600'
                    }`}>
                      {badge}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>
        </aside>

        <main className="min-w-0 space-y-4">
          {tab === 'overview' ? (
            <OverviewPanel dashboard={dashboard} setTab={setTab} />
          ) : (
            <section className="bg-white rounded-[20px] border-[1.5px] border-black overflow-hidden">
              <div className="p-3.5 md:p-4 border-b border-black/10 flex flex-col md:flex-row gap-3 md:items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold tracking-widest uppercase text-black/35">Operations</p>
                  <h2 className="text-[17px] font-bold tracking-tight mt-0.5">{activeSection.label}</h2>
                </div>
                {SEARCHABLE_TABS.has(tab) && (
                  <div className="relative w-full md:w-80">
                    <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/35" />
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={`Search ${activeSection.label.toLowerCase()}…`}
                      className="w-full h-10 pl-9 pr-3 rounded-full border-[1.5px] border-black/10 bg-[#F7F3EB] text-[13px] font-medium outline-none focus:border-black/30"
                    />
                  </div>
                )}
              </div>

              {tab === 'users' && <UsersTable rows={filtered} />}
              {tab === 'deals' && <EscrowsTable rows={filtered} busy={busy} runAction={runAction} />}
              {tab === 'finance' && <WalletTable rows={filtered} busy={busy} runAction={runAction} />}
              {tab === 'disputes' && <AdminDisputes />}
              {tab === 'hats' && <HatsTable rows={filtered} busy={busy} runAction={runAction} />}
              {tab === 'applications' && <ApplicationsTable rows={filtered} busy={busy} runAction={runAction} />}
              {tab === 'audit' && <AuditTable rows={filtered} />}
            </section>
          )}
        </main>
      </div>
    </div>
  )
}

function OverviewPanel({ dashboard, setTab }) {
  const metrics = dashboard?.metrics || {}
  const statusCounts = dashboard?.statusCounts || {}
  const audits = dashboard?.lists?.auditLogs || []
  const work = statusCounts.work || []
  const awaitingCompletion = work.find((row) => row.status === 'awaiting_completion')?.count || 0
  const awaitingStart = work.find((row) => row.status === 'awaiting_start')?.count || 0
  const unfunded = (statusCounts.escrows || []).find((row) => row.status === 'not_funded')?.count || 0

  return (
    <>
      <section className="grid grid-cols-2 xl:grid-cols-3 gap-3">
        <Metric icon={Users} label="Users" value={metrics.users} sub={`${metrics.talent_users || 0} talent-capable · ${metrics.client_users || 0} client-capable`} />
        <Metric icon={Handshake} label="Active Deals" value={metrics.active_deals} sub={fmtMoney(metrics.active_deal_value)} />
        <Metric icon={BadgeCheck} label="Completed Deals" value={metrics.completed_deals} sub={`${fmtMoney(metrics.completed_deal_value)} settled`} />
        <Metric icon={Wallet} label="Wallet Liability" value={fmtMoney(metrics.wallet_liability)} sub="Total user balances" />
        <Metric icon={Activity} label="Pending Withdrawals" value={metrics.pending_withdrawals} sub={fmtMoney(metrics.pending_withdrawal_value)} />
        <Metric icon={Gavel} label="Open Disputes" value={metrics.open_disputes} sub={`${metrics.active_hats || 0} active hats`} />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-5 gap-3">
        <div className="xl:col-span-3 bg-white rounded-[20px] border-[1.5px] border-black p-4">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <p className="text-[10px] font-bold tracking-widest uppercase text-black/35">Settlement pipeline</p>
              <h2 className="text-[16px] font-bold tracking-tight mt-0.5">Deal lifecycle</h2>
            </div>
            <button type="button" onClick={() => setTab('deals')} className="text-[11px] font-bold text-[#0A13E6]">
              View deals
            </button>
          </div>
          {work.length ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {work.map((row) => (
                <div key={row.status} className="rounded-[14px] bg-[#F7F3EB] p-3 min-w-0">
                  <StatusPill status={row.status} />
                  <p className="text-[21px] font-bold mt-2">{row.count}</p>
                  <p className="text-[10px] font-semibold text-black/40 truncate">{fmtMoney(row.amount)}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-black/40 font-medium">No deal lifecycle data yet.</p>
          )}
        </div>

        <div className="xl:col-span-2 bg-white rounded-[20px] border-[1.5px] border-black p-4">
          <p className="text-[10px] font-bold tracking-widest uppercase text-black/35">Needs attention</p>
          <h2 className="text-[16px] font-bold tracking-tight mt-0.5 mb-3">Operations queue</h2>
          <div className="space-y-2">
            <QueueItem label="Open disputes" value={metrics.open_disputes || 0} tone="danger" onClick={() => setTab('disputes')} />
            <QueueItem label="Pending withdrawals" value={metrics.pending_withdrawals || 0} tone="warning" onClick={() => setTab('finance')} />
            <QueueItem label="Awaiting completion QR" value={awaitingCompletion} onClick={() => setTab('deals')} />
            <QueueItem label="Awaiting start QR" value={awaitingStart} onClick={() => setTab('deals')} />
            <QueueItem label="Unfunded deals" value={unfunded} onClick={() => setTab('deals')} />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <StatusSummary title="Escrow Status" rows={statusCounts.escrows || []} money />
        <WalletSummary rows={statusCounts.wallet || []} />
        <div className="bg-white rounded-[16px] border-[1.5px] border-black p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-[13px] font-bold tracking-tight">Recent Admin Activity</h2>
            <button type="button" onClick={() => setTab('audit')} className="text-[10px] font-bold text-[#0A13E6]">Full log</button>
          </div>
          {!audits.length ? (
            <p className="text-[12px] text-black/40 font-medium">No admin actions recorded yet.</p>
          ) : (
            <div className="space-y-2.5">
              {audits.slice(0, 5).map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-3 text-[11px]">
                  <div className="min-w-0">
                    <p className="font-bold truncate">{cleanLabel(item.action)}</p>
                    <p className="text-black/40 truncate">@{item.admin_username || 'unknown'} · {cleanLabel(item.target_type)}</p>
                  </div>
                  <span className="text-black/35 whitespace-nowrap">{new Date(item.created_at).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  )
}

function QueueItem({ label, value, tone, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-[13px] border border-black/10 px-3 py-2.5 flex items-center justify-between gap-3 text-left hover:border-black/30 transition"
    >
      <span className="text-[12px] font-semibold text-black/65">{label}</span>
      <span className={`min-w-7 h-7 rounded-full px-2 grid place-items-center text-[11px] font-bold ${
        tone === 'danger'
          ? 'bg-red-50 text-red-700'
          : tone === 'warning'
            ? 'bg-amber-50 text-amber-700'
            : 'bg-[#F7F3EB] text-black'
      }`}>
        {value}
      </span>
    </button>
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
              <p className="font-bold"><UserIdentity user={u} layout="inline" showAvatar={false} nameClassName="font-bold" usernameClassName="font-semibold text-black/50" /></p>
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
              <p className="text-black/40"><UserIdentity user={identityFromHat(h)} layout="inline" showAvatar={false} nameClassName="font-semibold text-black/60" usernameClassName="font-semibold text-black/40" /> · {h.category}</p>
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
              <p className="font-bold"><UserIdentity user={identityFromRow(a, 'applicant')} layout="inline" showAvatar={false} nameClassName="font-bold" usernameClassName="font-semibold text-black/50" /></p>
              <p className="text-black/40">{a.hat_title}</p>
              <p className="text-black/35">Owner <UserIdentity user={identityFromRow(a, 'hat_owner')} layout="inline" showAvatar={false} nameClassName="font-semibold text-black/50" usernameClassName="font-semibold text-black/35" /></p>
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
          <Th>Escrow</Th>
          <Th>Work</Th>
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
              <p>Client {e.client_username ? <UserIdentity user={identityFromRow(e, 'client')} layout="inline" showAvatar={false} nameClassName="font-semibold" usernameClassName="font-semibold text-black/50" /> : '—'}</p>
              <p className="text-black/40">Talent {e.talent_username ? <UserIdentity user={identityFromRow(e, 'talent')} layout="inline" showAvatar={false} nameClassName="font-semibold text-black/60" usernameClassName="font-semibold text-black/40" /> : '—'}</p>
            </Td>
            <Td>{fmtMoney(e.amount)}</Td>
            <Td>
              <StatusPill status={e.status} />
              {Number(e.start_released_amount || 0) > 0 && (
                <p className="text-[10px] text-black/40 mt-1">{fmtMoney(e.start_released_amount)} start release</p>
              )}
            </Td>
            <Td>
              <StatusPill status={e.work_status || 'in_progress'} />
              {e.work_started_at && <p className="text-[10px] text-black/35 mt-1">Started {fmtDate(e.work_started_at)}</p>}
            </Td>
            <Td className="max-w-[220px]">
              <p className="truncate">{e.payment_reference || '—'}</p>
            </Td>
            <Td>{fmtDate(e.created_at)}</Td>
            <Td>
              {e.status === 'not_funded' && !e.checkout_locked_at ? (
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
              <Td>{t.username ? <UserIdentity user={resolveIdentity({ username: t.username, fullName: t.user_full_name, role: t.user_role, companySuffix: t.user_company_suffix })} layout="inline" showAvatar={false} nameClassName="font-semibold" usernameClassName="font-semibold text-black/50" /> : '—'}</Td>
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
            <Td>{log.admin_username ? <UserIdentity user={identityFromRow(log, 'admin')} layout="inline" showAvatar={false} nameClassName="font-semibold" usernameClassName="font-semibold text-black/50" /> : 'unknown'}</Td>
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
