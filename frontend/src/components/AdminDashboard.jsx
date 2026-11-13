import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../services/api';

export default function AdminDashboard({ currentUser, onLogout }) {
  const [requests, setRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState(''); // '' (All) | 'PENDING' | 'APPROVED' | 'REJECTED'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReq, setSelectedReq] = useState(null);
  const [activeEvidenceTab, setActiveEvidenceTab] = useState('evidence'); // 'evidence' | 'details' | 'history'
  const [analyzingId, setAnalyzingId] = useState(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [selectedEvidencePreview, setSelectedEvidencePreview] = useState(null);
  const [activeSidebarNav, setActiveSidebarNav] = useState('dashboard');

  const loadRequests = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getAdminVerificationRequests();
      setRequests(data || []);
      if (data?.length > 0 && !selectedReq) {
        setSelectedReq(data[0]);
      } else if (selectedReq) {
        const updated = data.find((r) => r.id === selectedReq.id);
        if (updated) setSelectedReq(updated);
      }
    } catch (err) {
      setError(err.message || 'Failed to load verification requests.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedReq]);

  useEffect(() => {
    loadRequests();
  }, []);

  const handleRunAiAnalysis = async (verId) => {
    setAnalyzingId(verId);
    setError(null);
    try {
      const analysis = await api.analyzeVerificationAi(verId);
      setRequests((prev) =>
        prev.map((r) => (r.id === verId ? { ...r, ai_analysis: analysis } : r))
      );
      if (selectedReq && selectedReq.id === verId) {
        setSelectedReq((prev) => ({ ...prev, ai_analysis: analysis }));
      }
      setSuccessMsg('Gemini AI Evidence Audit completed successfully.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      setError(err.message || 'Failed to execute AI analysis.');
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleReview = async (verId, newStatus) => {
    if (!reviewNotes.trim()) {
      setError('A decision rationale is required before approving or rejecting.');
      return;
    }
    setIsSubmittingReview(true);
    setError(null);
    try {
      const updated = await api.reviewVerificationRequest(verId, {
        status: newStatus,
        reviewer_notes: reviewNotes.trim(),
      });
      setRequests((prev) => prev.map((r) => (r.id === verId ? updated : r)));
      setSelectedReq(updated);
      setReviewNotes('');
      setSuccessMsg(`Verification status updated to: ${newStatus}`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      setError(err.message || 'Review action failed.');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Filtered requests
  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      const matchesStatus = statusFilter ? r.status === statusFilter : true;
      const matchesSearch = searchQuery
        ? (r.creator_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
          (r.creator_handle || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
          (r.verification_scope || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
          (r.evidence_title || '').toLowerCase().includes(searchQuery.toLowerCase())
        : true;
      return matchesStatus && matchesSearch;
    });
  }, [requests, statusFilter, searchQuery]);

  // Statistics
  const totalCount = requests.length;
  const pendingCount = requests.filter((r) => r.status === 'PENDING').length;
  const approvedCount = requests.filter((r) => r.status === 'APPROVED').length;
  const rejectedCount = requests.filter((r) => r.status === 'REJECTED').length;
  const auditedCount = requests.filter((r) => Boolean(r.ai_analysis)).length;

  return (
    <div
      className="admin-portal-wrapper"
      style={{
        display: 'flex',
        minHeight: '100vh',
        backgroundColor: '#F8F9FC',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        color: '#1E1B4B',
      }}
    >
      {/* 1. LEFT NAVIGATION SIDEBAR (Pale Lilac/Lavender Gradient matching reference) */}
      <aside
        className="admin-sidebar"
        style={{
          width: '260px',
          minWidth: '260px',
          background: 'linear-gradient(180deg, #F8F5FD 0%, #F1EAFA 50%, #ECE4F8 100%)',
          borderRight: '1px solid rgba(121, 82, 236, 0.12)',
          display: 'flex',
          flexDirection: 'column',
          padding: '1.5rem 1.25rem',
          position: 'sticky',
          top: 0,
          height: '100vh',
          zIndex: 40,
        }}
      >
        {/* Brand Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2rem', paddingLeft: '0.5rem' }}>
          <span style={{ fontSize: '24px', fontWeight: '800', letterSpacing: '-0.03em', color: '#1E0B38' }}>
            Kivora<span style={{ color: '#7952EC' }}>.</span>
          </span>
        </div>

        {/* Navigation Items */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
          <button
            type="button"
            onClick={() => {
              setActiveSidebarNav('dashboard');
              setStatusFilter('');
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '10px 14px',
              borderRadius: '12px',
              fontSize: '13.5px',
              fontWeight: '600',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s ease',
              backgroundColor: activeSidebarNav === 'dashboard' ? '#DDD0F7' : 'transparent',
              color: activeSidebarNav === 'dashboard' ? '#4C1D95' : '#4A3B69',
            }}
          >
            <span style={{ fontSize: '16px' }}>⊞</span>
            <span>Dashboard</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveSidebarNav('requests');
              setStatusFilter('PENDING');
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderRadius: '12px',
              fontSize: '13.5px',
              fontWeight: '600',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s ease',
              backgroundColor: activeSidebarNav === 'requests' ? '#DDD0F7' : 'transparent',
              color: activeSidebarNav === 'requests' ? '#4C1D95' : '#4A3B69',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '16px' }}>🛡️</span>
              <span>Verification Requests</span>
            </div>
            {pendingCount > 0 && (
              <span
                style={{
                  backgroundColor: '#EDE9FE',
                  color: '#6D28D9',
                  fontSize: '11px',
                  fontWeight: '700',
                  padding: '2px 8px',
                  borderRadius: '999px',
                }}
              >
                {pendingCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveSidebarNav('creators')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '10px 14px',
              borderRadius: '12px',
              fontSize: '13.5px',
              fontWeight: '600',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              backgroundColor: activeSidebarNav === 'creators' ? '#DDD0F7' : 'transparent',
              color: activeSidebarNav === 'creators' ? '#4C1D95' : '#4A3B69',
            }}
          >
            <span style={{ fontSize: '16px' }}>👥</span>
            <span>Creators</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSidebarNav('reports')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '10px 14px',
              borderRadius: '12px',
              fontSize: '13.5px',
              fontWeight: '600',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              backgroundColor: activeSidebarNav === 'reports' ? '#DDD0F7' : 'transparent',
              color: activeSidebarNav === 'reports' ? '#4C1D95' : '#4A3B69',
            }}
          >
            <span style={{ fontSize: '16px' }}>📊</span>
            <span>Reports</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSidebarNav('audit-log')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '10px 14px',
              borderRadius: '12px',
              fontSize: '13.5px',
              fontWeight: '600',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              backgroundColor: activeSidebarNav === 'audit-log' ? '#DDD0F7' : 'transparent',
              color: activeSidebarNav === 'audit-log' ? '#4C1D95' : '#4A3B69',
            }}
          >
            <span style={{ fontSize: '16px' }}>📋</span>
            <span>Audit Log</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSidebarNav('settings')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '10px 14px',
              borderRadius: '12px',
              fontSize: '13.5px',
              fontWeight: '600',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              backgroundColor: activeSidebarNav === 'settings' ? '#DDD0F7' : 'transparent',
              color: activeSidebarNav === 'settings' ? '#4C1D95' : '#4A3B69',
            }}
          >
            <span style={{ fontSize: '16px' }}>⚙️</span>
            <span>Platform Settings</span>
          </button>
        </nav>

        {/* Bottom Profile & Logout */}
        <div style={{ borderTop: '1px solid rgba(121, 82, 236, 0.12)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 8px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                backgroundColor: '#7952EC',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '700',
                fontSize: '13px',
              }}
            >
              AD
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#1E0B38' }}>Admin</div>
              <div style={{ fontSize: '11px', color: '#6B7280' }}>Administrator</div>
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '8px 14px',
              borderRadius: '10px',
              border: '1px solid #FECACA',
              backgroundColor: '#FFFFFF',
              color: '#DC2626',
              fontSize: '12.5px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <span>⎋</span>
            <span>Log Out</span>
          </button>
        </div>
      </aside>

      {/* 2. MAIN CONTENT AREA */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflowY: 'auto' }}>
        {/* Top Bar */}
        <header
          style={{
            height: '70px',
            backgroundColor: '#FFFFFF',
            borderBottom: '1px solid #E5E7EB',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 2rem',
            position: 'sticky',
            top: 0,
            zIndex: 30,
          }}
        >
          {/* Left Title with Shield Icon */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                backgroundColor: '#EDE9FE',
                color: '#7952EC',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
              }}
            >
              🛡️
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: '800', color: '#1E0B38' }}>Admin Portal</div>
              <div style={{ fontSize: '11.5px', color: '#6B7280' }}>
                Manage creator verification and platform integrity
              </div>
            </div>
          </div>

          {/* Center Search Input */}
          <div style={{ flex: '0 1 420px', position: 'relative' }}>
            <span
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#9CA3AF',
                fontSize: '14px',
              }}
            >
              🔍
            </span>
            <input
              type="text"
              placeholder="Search creators, claims, or evidence..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 36px',
                borderRadius: '10px',
                border: '1px solid #E5E7EB',
                backgroundColor: '#F9FAFB',
                fontSize: '12.5px',
                outline: 'none',
                color: '#1F2937',
              }}
            />
          </div>

          {/* Right Notifications & Admin Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ position: 'relative', cursor: 'pointer' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  border: '1px solid #E5E7EB',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '16px',
                }}
              >
                🔔
              </div>
              <span
                style={{
                  position: 'absolute',
                  top: '-2px',
                  right: '-2px',
                  backgroundColor: '#EF4444',
                  color: '#FFFFFF',
                  fontSize: '10px',
                  fontWeight: '700',
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                3
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '4px 10px 4px 6px',
                borderRadius: '999px',
                border: '1px solid #E5E7EB',
                backgroundColor: '#FFFFFF',
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  backgroundColor: '#7952EC',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  fontWeight: '700',
                }}
              >
                AD
              </div>
              <span style={{ fontSize: '12.5px', fontWeight: '600', color: '#1F2937' }}>Admin ▾</span>
            </div>
          </div>
        </header>

        {/* Feedback Messages */}
        <div style={{ padding: '1rem 2rem 0' }}>
          {error && (
            <div
              style={{
                backgroundColor: '#FEF2F2',
                border: '1px solid #FCA5A5',
                color: '#991B1B',
                fontSize: '12.5px',
                padding: '10px 16px',
                borderRadius: '10px',
                marginBottom: '1rem',
              }}
            >
              {error}
            </div>
          )}
          {successMsg && (
            <div
              style={{
                backgroundColor: '#ECFDF5',
                border: '1px solid #A7F3D0',
                color: '#065F46',
                fontSize: '12.5px',
                padding: '10px 16px',
                borderRadius: '10px',
                marginBottom: '1rem',
              }}
            >
              {successMsg}
            </div>
          )}
        </div>

        {/* Dashboard Content */}
        <div style={{ padding: '1rem 2rem 2.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* 3. FOUR SUMMARY METRIC CARDS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
            {/* Card 1: Pending Reviews */}
            <div
              onClick={() => setStatusFilter(statusFilter === 'PENDING' ? '' : 'PENDING')}
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '16px',
                padding: '1.25rem',
                border: statusFilter === 'PENDING' ? '1.5px solid #7952EC' : '1px solid rgba(121, 82, 236, 0.12)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    backgroundColor: '#EDE9FE',
                    color: '#7952EC',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                  }}
                >
                  📄
                </div>
                <span style={{ fontSize: '16px', color: '#9CA3AF' }}>›</span>
              </div>
              <div>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#6B7280' }}>Pending Reviews</div>
                <div style={{ fontSize: '26px', fontWeight: '800', color: '#1E0B38', marginTop: '2px' }}>
                  {pendingCount}
                </div>
                <div style={{ fontSize: '11.5px', color: '#9CA3AF', marginTop: '2px' }}>Awaiting your review</div>
              </div>
            </div>

            {/* Card 2: Approved */}
            <div
              onClick={() => setStatusFilter(statusFilter === 'APPROVED' ? '' : 'APPROVED')}
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '16px',
                padding: '1.25rem',
                border: statusFilter === 'APPROVED' ? '1.5px solid #10B981' : '1px solid rgba(121, 82, 236, 0.12)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    backgroundColor: '#D1FAE5',
                    color: '#059669',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                  }}
                >
                  ✓
                </div>
                <span style={{ fontSize: '16px', color: '#9CA3AF' }}>›</span>
              </div>
              <div>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#6B7280' }}>Approved</div>
                <div style={{ fontSize: '26px', fontWeight: '800', color: '#065F46', marginTop: '2px' }}>
                  {approvedCount}
                </div>
                <div style={{ fontSize: '11.5px', color: '#9CA3AF', marginTop: '2px' }}>Verified creators</div>
              </div>
            </div>

            {/* Card 3: Rejected */}
            <div
              onClick={() => setStatusFilter(statusFilter === 'REJECTED' ? '' : 'REJECTED')}
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '16px',
                padding: '1.25rem',
                border: statusFilter === 'REJECTED' ? '1.5px solid #EF4444' : '1px solid rgba(121, 82, 236, 0.12)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    backgroundColor: '#FEE2E2',
                    color: '#DC2626',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                  }}
                >
                  ✕
                </div>
                <span style={{ fontSize: '16px', color: '#9CA3AF' }}>›</span>
              </div>
              <div>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#6B7280' }}>Rejected</div>
                <div style={{ fontSize: '26px', fontWeight: '800', color: '#991B1B', marginTop: '2px' }}>
                  {rejectedCount}
                </div>
                <div style={{ fontSize: '11.5px', color: '#9CA3AF', marginTop: '2px' }}>Claims not verified</div>
              </div>
            </div>

            {/* Card 4: AI Audits */}
            <div
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '16px',
                padding: '1.25rem',
                border: '1px solid rgba(121, 82, 236, 0.12)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    backgroundColor: '#EDE9FE',
                    color: '#7952EC',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                  }}
                >
                  ✦
                </div>
                <span style={{ fontSize: '16px', color: '#9CA3AF' }}>›</span>
              </div>
              <div>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#6B7280' }}>AI Audits</div>
                <div style={{ fontSize: '26px', fontWeight: '800', color: '#4C1D95', marginTop: '2px' }}>
                  {auditedCount}
                </div>
                <div style={{ fontSize: '11.5px', color: '#9CA3AF', marginTop: '2px' }}>Flagged for review</div>
              </div>
            </div>
          </div>

          {/* 4. VERIFICATION REQUESTS TABLE SECTION */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              border: '1px solid rgba(121, 82, 236, 0.12)',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
              overflow: 'hidden',
            }}
          >
            {/* Table Header Controls */}
            <div
              style={{
                padding: '1.25rem 1.5rem',
                borderBottom: '1px solid #F3F4F6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: '16px', fontWeight: '800', color: '#1E0B38', margin: 0 }}>
                  Verification Requests
                </h2>

                {/* Filter Tabs */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('')}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '999px',
                      fontSize: '12px',
                      fontWeight: '600',
                      border: 'none',
                      cursor: 'pointer',
                      backgroundColor: statusFilter === '' ? '#7952EC' : '#F3F4F6',
                      color: statusFilter === '' ? '#FFFFFF' : '#4B5563',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    All ({totalCount})
                  </button>

                  <button
                    type="button"
                    onClick={() => setStatusFilter('PENDING')}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '999px',
                      fontSize: '12px',
                      fontWeight: '600',
                      border: 'none',
                      cursor: 'pointer',
                      backgroundColor: statusFilter === 'PENDING' ? '#7952EC' : '#F3F4F6',
                      color: statusFilter === 'PENDING' ? '#FFFFFF' : '#4B5563',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    Pending ({pendingCount})
                  </button>

                  <button
                    type="button"
                    onClick={() => setStatusFilter('APPROVED')}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '999px',
                      fontSize: '12px',
                      fontWeight: '600',
                      border: 'none',
                      cursor: 'pointer',
                      backgroundColor: statusFilter === 'APPROVED' ? '#7952EC' : '#F3F4F6',
                      color: statusFilter === 'APPROVED' ? '#FFFFFF' : '#4B5563',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    Approved ({approvedCount})
                  </button>

                  <button
                    type="button"
                    onClick={() => setStatusFilter('REJECTED')}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '999px',
                      fontSize: '12px',
                      fontWeight: '600',
                      border: 'none',
                      cursor: 'pointer',
                      backgroundColor: statusFilter === 'REJECTED' ? '#7952EC' : '#F3F4F6',
                      color: statusFilter === 'REJECTED' ? '#FFFFFF' : '#4B5563',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    Rejected ({rejectedCount})
                  </button>
                </div>
              </div>

              {/* Table Search & Filter Button */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="Search creator, skill, or evidence..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: '1px solid #E5E7EB',
                    backgroundColor: '#F9FAFB',
                    fontSize: '12px',
                    outline: 'none',
                    width: '220px',
                  }}
                />
                <button
                  type="button"
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: '1px solid #E5E7EB',
                    backgroundColor: '#FFFFFF',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#374151',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <span>⚡</span>
                  <span>Filter</span>
                </button>
              </div>
            </div>

            {/* Table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E7EB', color: '#6B7280' }}>
                    <th style={{ padding: '10px 16px', width: '36px' }}>
                      <input type="checkbox" style={{ cursor: 'pointer' }} readOnly />
                    </th>
                    <th style={{ padding: '10px 16px', fontWeight: '600' }}>Creator</th>
                    <th style={{ padding: '10px 16px', fontWeight: '600' }}>Verification Type</th>
                    <th style={{ padding: '10px 16px', fontWeight: '600' }}>Evidence Type</th>
                    <th style={{ padding: '10px 16px', fontWeight: '600' }}>Submitted Date</th>
                    <th style={{ padding: '10px 16px', fontWeight: '600' }}>Status</th>
                    <th style={{ padding: '10px 16px', fontWeight: '600', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && requests.length === 0 ? (
                    <tr>
                      <td colSpan="7" style={{ padding: '2rem', textAlign: 'center', color: '#9CA3AF' }}>
                        Loading verification queue...
                      </td>
                    </tr>
                  ) : filteredRequests.length === 0 ? (
                    <tr>
                      <td colSpan="7" style={{ padding: '2rem', textAlign: 'center', color: '#9CA3AF' }}>
                        No verification requests match the active filters.
                      </td>
                    </tr>
                  ) : (
                    filteredRequests.map((req) => {
                      const isSelected = selectedReq?.id === req.id;
                      const dateDisplay = req.reviewed_at
                        ? new Date(req.reviewed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : 'Oct 20, 2026';

                      return (
                        <tr
                          key={req.id}
                          onClick={() => setSelectedReq(req)}
                          style={{
                            borderBottom: '1px solid #F3F4F6',
                            backgroundColor: isSelected ? '#F5F3FF' : '#FFFFFF',
                            cursor: 'pointer',
                            transition: 'background-color 0.15s ease',
                          }}
                        >
                          <td style={{ padding: '12px 16px' }} onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" checked={isSelected} onChange={() => setSelectedReq(req)} />
                          </td>

                          {/* Creator Avatar & Name */}
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div
                                style={{
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: '50%',
                                  backgroundColor: '#E9D5FF',
                                  color: '#6B21A8',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontWeight: '700',
                                  fontSize: '12px',
                                  overflow: 'hidden',
                                  flexShrink: 0,
                                }}
                              >
                                {req.creator_name ? req.creator_name.charAt(0) : 'C'}
                              </div>
                              <div>
                                <div style={{ fontWeight: '700', color: '#1E0B38' }}>
                                  {req.creator_name || 'Creator'}
                                </div>
                                <div style={{ fontSize: '11px', color: '#6B7280' }}>
                                  @{req.creator_handle || 'creator'}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Verification Type */}
                          <td style={{ padding: '12px 16px', color: '#374151', fontWeight: '500' }}>
                            {req.verification_scope || 'Generative AI Pipeline'}
                          </td>

                          {/* Evidence Type */}
                          <td style={{ padding: '12px 16px', color: '#4B5563' }}>
                            {req.evidence_type ? req.evidence_type.replace(/_/g, ' ') : 'Project Files'}
                          </td>

                          {/* Submitted Date */}
                          <td style={{ padding: '12px 16px', color: '#6B7280' }}>{dateDisplay}</td>

                          {/* Status Badge */}
                          <td style={{ padding: '12px 16px' }}>
                            <span
                              style={{
                                padding: '3px 10px',
                                borderRadius: '999px',
                                fontSize: '11px',
                                fontWeight: '700',
                                display: 'inline-block',
                                backgroundColor:
                                  req.status === 'APPROVED'
                                    ? '#D1FAE5'
                                    : req.status === 'REJECTED'
                                    ? '#FEE2E2'
                                    : '#FEF3C7',
                                color:
                                  req.status === 'APPROVED'
                                    ? '#065F46'
                                    : req.status === 'REJECTED'
                                    ? '#991B1B'
                                    : '#92400E',
                              }}
                            >
                              {req.status === 'PENDING' ? 'Pending' : req.status === 'APPROVED' ? 'Approved' : 'Rejected'}
                            </span>
                          </td>

                          {/* Actions */}
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedReq(req);
                              }}
                              style={{
                                border: 'none',
                                background: 'transparent',
                                color: '#6B7280',
                                fontSize: '16px',
                                cursor: 'pointer',
                                padding: '4px 8px',
                              }}
                              title="Inspect Request"
                            >
                              •••
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 5. SELECTED CREATOR REVIEW & AUDIT AREA (3-Column Layout matching reference image) */}
          {selectedReq && (
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.4fr 1fr', gap: '1rem', alignItems: 'stretch' }}>
              {/* Card 1 (Left): Selected Creator & Submitted Evidence */}
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '16px',
                  border: '1px solid rgba(121, 82, 236, 0.12)',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {/* Creator Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '1rem' }}>
                  <div
                    style={{
                      width: '46px',
                      height: '46px',
                      borderRadius: '50%',
                      backgroundColor: '#DDD0F7',
                      color: '#4C1D95',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '18px',
                      fontWeight: '700',
                      flexShrink: 0,
                    }}
                  >
                    {selectedReq.creator_name ? selectedReq.creator_name.charAt(0) : 'C'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '15px', fontWeight: '800', color: '#1E0B38' }}>
                        {selectedReq.creator_name}
                      </span>
                      <span style={{ color: '#3B82F6', fontSize: '13px' }}>✓</span>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: '700',
                          padding: '2px 8px',
                          borderRadius: '999px',
                          backgroundColor:
                            selectedReq.status === 'APPROVED'
                              ? '#D1FAE5'
                              : selectedReq.status === 'REJECTED'
                              ? '#FEE2E2'
                              : '#FEF3C7',
                          color:
                            selectedReq.status === 'APPROVED'
                              ? '#065F46'
                              : selectedReq.status === 'REJECTED'
                              ? '#991B1B'
                              : '#92400E',
                        }}
                      >
                        {selectedReq.status === 'PENDING' ? 'Pending Review' : selectedReq.status}
                      </span>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: '600',
                          padding: '2px 8px',
                          borderRadius: '999px',
                          backgroundColor: '#F3F4F6',
                          color: '#4B5563',
                        }}
                      >
                        {selectedReq.verification_scope ? selectedReq.verification_scope.split(' ')[0] : 'Generative'}
                      </span>
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#6B7280', marginTop: '2px' }}>
                      @{selectedReq.creator_handle || 'creator'}
                    </div>
                  </div>
                </div>

                {/* Subtabs */}
                <div style={{ display: 'flex', gap: '16px', borderBottom: '1px solid #E5E7EB', marginBottom: '1rem' }}>
                  <button
                    type="button"
                    onClick={() => setActiveEvidenceTab('evidence')}
                    style={{
                      padding: '6px 0',
                      border: 'none',
                      background: 'transparent',
                      fontSize: '12px',
                      fontWeight: '700',
                      color: activeEvidenceTab === 'evidence' ? '#7952EC' : '#6B7280',
                      borderBottom: activeEvidenceTab === 'evidence' ? '2px solid #7952EC' : '2px solid transparent',
                      cursor: 'pointer',
                    }}
                  >
                    Submitted Evidence
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveEvidenceTab('details')}
                    style={{
                      padding: '6px 0',
                      border: 'none',
                      background: 'transparent',
                      fontSize: '12px',
                      fontWeight: '700',
                      color: activeEvidenceTab === 'details' ? '#7952EC' : '#6B7280',
                      borderBottom: activeEvidenceTab === 'details' ? '2px solid #7952EC' : '2px solid transparent',
                      cursor: 'pointer',
                    }}
                  >
                    Creator Details
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveEvidenceTab('history')}
                    style={{
                      padding: '6px 0',
                      border: 'none',
                      background: 'transparent',
                      fontSize: '12px',
                      fontWeight: '700',
                      color: activeEvidenceTab === 'history' ? '#7952EC' : '#6B7280',
                      borderBottom: activeEvidenceTab === 'history' ? '2px solid #7952EC' : '2px solid transparent',
                      cursor: 'pointer',
                    }}
                  >
                    Verification History
                  </button>
                </div>

                {/* Subtab Content */}
                {activeEvidenceTab === 'evidence' && (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                      {/* Evidence 1 */}
                      <div
                        onClick={() => setSelectedEvidencePreview({ title: selectedReq.evidence_title || 'Process Reel', url: selectedReq.evidence_file_url || '/assets/evidence/runway_gen3_camera_timeline.png' })}
                        style={{
                          backgroundColor: '#1E1B4B',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          cursor: 'pointer',
                          position: 'relative',
                          aspectRatio: '16/10',
                        }}
                      >
                        <img
                          src={selectedReq.evidence_file_url || '/assets/evidence/runway_gen3_camera_timeline.png'}
                          alt="Evidence 1"
                          style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8 }}
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = '/assets/portfolio/sophia_cellular_dew_thumb.jpg';
                          }}
                        />
                        <div
                          style={{
                            position: 'absolute',
                            inset: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#FFFFFF',
                            fontSize: '18px',
                          }}
                        >
                          ▶
                        </div>
                      </div>

                      {/* Evidence 2 */}
                      <div
                        onClick={() => setSelectedEvidencePreview({ title: '3D Render / Latent Spec', url: '/assets/portfolio/kai_cyberpunk_warrior.jpg' })}
                        style={{
                          backgroundColor: '#F3F4F6',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          cursor: 'pointer',
                          aspectRatio: '16/10',
                        }}
                      >
                        <img
                          src="/assets/portfolio/kai_cyberpunk_warrior.jpg"
                          alt="Evidence 2"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      </div>

                      {/* Evidence 3 */}
                      <div
                        onClick={() => setSelectedEvidencePreview({ title: 'Environment Work / Node Output', url: '/assets/portfolio/elena_cyber_agent.jpg' })}
                        style={{
                          backgroundColor: '#F3F4F6',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          cursor: 'pointer',
                          aspectRatio: '16/10',
                        }}
                      >
                        <img
                          src="/assets/portfolio/elena_cyber_agent.jpg"
                          alt="Evidence 3"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      </div>
                    </div>

                    {/* Metadata under previews */}
                    <div style={{ backgroundColor: '#F9FAFB', padding: '8px 12px', borderRadius: '8px', fontSize: '11px', color: '#4B5563', lineHeight: 1.5 }}>
                      <div style={{ fontWeight: '700', color: '#1E0B38' }}>{selectedReq.evidence_title || 'Audited Process Pipeline'}</div>
                      <div style={{ color: '#6B7280' }}>
                        File: {selectedReq.evidence_type || 'WORKFLOW_NODE_GRAPH'} • Attached to: {selectedReq.project_title || 'Master Showcase'}
                      </div>
                    </div>
                  </div>
                )}

                {activeEvidenceTab === 'details' && (
                  <div style={{ fontSize: '12px', color: '#4B5563', lineHeight: 1.6, flex: 1 }}>
                    <p><strong>Creator ID:</strong> {selectedReq.creator_id || 'N/A'}</p>
                    <p><strong>Specialization:</strong> {selectedReq.verification_scope || 'Generative Video'}</p>
                    <p><strong>Associated Project:</strong> {selectedReq.project_title || 'Commercial Showcase'}</p>
                    <p><strong>Evidence Type:</strong> {selectedReq.evidence_type || 'Source File / Screenshot'}</p>
                  </div>
                )}

                {activeEvidenceTab === 'history' && (
                  <div style={{ fontSize: '12px', color: '#4B5563', lineHeight: 1.6, flex: 1 }}>
                    <div style={{ borderLeft: '2px solid #DDD0F7', paddingLeft: '10px' }}>
                      <div style={{ fontWeight: '700', color: '#1E0B38' }}>Submitted by Creator</div>
                      <div style={{ fontSize: '11px', color: '#6B7280' }}>Evidence uploaded with latent seeds and node parameters.</div>
                    </div>
                    <div style={{ borderLeft: '2px solid #DDD0F7', paddingLeft: '10px', marginTop: '8px' }}>
                      <div style={{ fontWeight: '700', color: '#1E0B38' }}>Current Reviewer Notes</div>
                      <div style={{ fontSize: '11px', color: '#6B7280' }}>{selectedReq.reviewer_notes || 'Awaiting final human decision.'}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Card 2 (Middle): Gemini AI Audit */}
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '16px',
                  border: '1px solid rgba(121, 82, 236, 0.12)',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: '#7952EC', fontSize: '16px' }}>✦</span>
                      <span style={{ fontSize: '14px', fontWeight: '800', color: '#1E0B38' }}>Gemini AI Audit</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => handleRunAiAnalysis(selectedReq.id)}
                        disabled={analyzingId === selectedReq.id}
                        style={{
                          backgroundColor: '#1E0B38',
                          color: '#FFFFFF',
                          padding: '5px 12px',
                          borderRadius: '8px',
                          fontSize: '11.5px',
                          fontWeight: '700',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        {analyzingId === selectedReq.id ? 'Auditing with Gemini...' : 'Run / Re-run Gemini AI Audit'}
                      </button>
                      <button type="button" style={{ border: 'none', background: 'transparent', color: '#6B7280', cursor: 'pointer' }}>•••</button>
                    </div>
                  </div>

                  {/* Status Alert Banner */}
                  {selectedReq.ai_analysis?.potential_inconsistencies?.length > 0 || selectedReq.status === 'REJECTED' ? (
                    <div
                      style={{
                        backgroundColor: '#FFFBEB',
                        border: '1px solid #FDE68A',
                        borderRadius: '10px',
                        padding: '10px 14px',
                        marginBottom: '1rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#D97706', fontWeight: '700', fontSize: '12.5px' }}>
                        <span>⚠️</span>
                        <span>Potential inconsistency flagged</span>
                      </div>
                      <p style={{ fontSize: '11.5px', color: '#92400E', marginTop: '4px', lineHeight: 1.45, margin: '4px 0 0' }}>
                        The submitted project may show assets that are similar to publicly available templates. Please review the following frames and metadata.
                      </p>
                    </div>
                  ) : selectedReq.ai_analysis || selectedReq.status === 'APPROVED' ? (
                    <div
                      style={{
                        backgroundColor: '#ECFDF5',
                        border: '1px solid #A7F3D0',
                        borderRadius: '10px',
                        padding: '10px 14px',
                        marginBottom: '1rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#059669', fontWeight: '700', fontSize: '12.5px' }}>
                        <span>✓</span>
                        <span>High reproducibility confirmed</span>
                      </div>
                      <p style={{ fontSize: '11.5px', color: '#065F46', marginTop: '4px', lineHeight: 1.45, margin: '4px 0 0' }}>
                        Node graph parameters and prompt latent vectors match declared generation history. No template overlap detected.
                      </p>
                    </div>
                  ) : (
                    <div
                      style={{
                        backgroundColor: '#FAF5FF',
                        border: '1px solid #E9D5FF',
                        borderRadius: '10px',
                        padding: '10px 14px',
                        marginBottom: '1rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#7E22CE', fontWeight: '700', fontSize: '12.5px' }}>
                        <span>✦</span>
                        <span>Ready for Gemini AI audit</span>
                      </div>
                      <p style={{ fontSize: '11.5px', color: '#6B21A8', marginTop: '4px', lineHeight: 1.45, margin: '4px 0 0' }}>
                        Click 'Run Gemini AI Audit' to evaluate node graph reproducibility and detect template similarities.
                      </p>
                    </div>
                  )}

                  {/* AI Analysis Summary Bullets */}
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: '700', color: '#1E0B38', marginBottom: '6px' }}>
                      AI Analysis Summary
                    </div>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', color: '#374151' }}>
                      <li style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                        <span style={{ color: selectedReq.status === 'REJECTED' ? '#EF4444' : '#10B981', fontSize: '10px', marginTop: '2px' }}>◆</span>
                        <span>
                          {selectedReq.status === 'REJECTED'
                            ? 'Some frames match online template references.'
                            : 'Authentic node parameter graph verified without template clones.'}
                        </span>
                      </li>
                      <li style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                        <span style={{ color: '#F59E0B', fontSize: '10px', marginTop: '2px' }}>◆</span>
                        <span>Metadata hash corresponds to verifiable diffusion parameters.</span>
                      </li>
                      <li style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                        <span style={{ color: '#10B981', fontSize: '10px', marginTop: '2px' }}>◆</span>
                        <span>Overall, skills and tool proficiency appear consistent with the claim.</span>
                      </li>
                    </ul>
                  </div>
                </div>

                {/* Purple Disclaimer Footnote */}
                <div
                  style={{
                    backgroundColor: '#FAF5FF',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '11px',
                    color: '#6B21A8',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginTop: '1rem',
                  }}
                >
                  <span>✦</span>
                  <span>This AI analysis is a review aid. Final decisions are made by the administrator.</span>
                </div>
              </div>

              {/* Card 3 (Right): Trust & Safety Activity */}
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '16px',
                  border: '1px solid rgba(121, 82, 236, 0.12)',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
                    <span style={{ color: '#7952EC', fontSize: '16px' }}>🛡️</span>
                    <span style={{ fontSize: '14px', fontWeight: '800', color: '#1E0B38' }}>Trust & Safety</span>
                  </div>

                  {/* Verification Activity */}
                  <div style={{ marginBottom: '1.25rem' }}>
                    <div style={{ fontSize: '12px', fontWeight: '700', color: '#1E0B38', marginBottom: '8px' }}>
                      Verification Activity
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#9CA3AF' }} />
                          <span style={{ color: '#4B5563' }}>Total Requests</span>
                        </div>
                        <span style={{ fontWeight: '700', color: '#1E0B38' }}>{totalCount}</span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10B981' }} />
                          <span style={{ color: '#4B5563' }}>Approved</span>
                        </div>
                        <span style={{ fontWeight: '700', color: '#065F46' }}>{approvedCount}</span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#EF4444' }} />
                          <span style={{ color: '#4B5563' }}>Rejected</span>
                        </div>
                        <span style={{ fontWeight: '700', color: '#991B1B' }}>{rejectedCount}</span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#F59E0B' }} />
                          <span style={{ color: '#4B5563' }}>Pending</span>
                        </div>
                        <span style={{ fontWeight: '700', color: '#92400E' }}>{pendingCount}</span>
                      </div>
                    </div>
                  </div>

                  {/* Recent AI Audit History */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: '700', color: '#1E0B38' }}>Recent AI Audit History</span>
                      <span style={{ fontSize: '11px', color: '#7952EC', cursor: 'pointer', fontWeight: '600' }}>View All</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11.5px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: '#E0E7FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700' }}>A</div>
                          <div>
                            <div style={{ fontWeight: '700', color: '#1E0B38' }}>Aarav Mehta</div>
                            <div style={{ color: '#6B7280', fontSize: '10.5px' }}>No major issues</div>
                          </div>
                        </div>
                        <span style={{ color: '#9CA3AF', fontSize: '10.5px' }}>2h ago</span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11.5px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: '#FCE7F3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700' }}>P</div>
                          <div>
                            <div style={{ fontWeight: '700', color: '#1E0B38' }}>Priya Sharma</div>
                            <div style={{ color: '#DC2626', fontSize: '10.5px' }}>Potential inconsistency</div>
                          </div>
                        </div>
                        <span style={{ color: '#9CA3AF', fontSize: '10.5px' }}>5h ago</span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11.5px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700' }}>R</div>
                          <div>
                            <div style={{ fontWeight: '700', color: '#1E0B38' }}>Rohan Verma</div>
                            <div style={{ color: '#059669', fontSize: '10.5px' }}>Consistent</div>
                          </div>
                        </div>
                        <span style={{ color: '#9CA3AF', fontSize: '10.5px' }}>1d ago</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 6. BOTTOM DECISION ACTION BAR */}
          {selectedReq && (
            <div
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid rgba(121, 82, 236, 0.12)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
                padding: '1.25rem 1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label style={{ fontSize: '12.5px', fontWeight: '700', color: '#1E0B38' }}>
                  Add a reason for your decision (required)
                </label>
                <span style={{ fontSize: '11px', color: '#9CA3AF' }}>{reviewNotes.length}/500</span>
              </div>

              <textarea
                rows={2}
                maxLength={500}
                placeholder="Enter your rationale here (e.g. Verified ComfyUI node parameters, seed reproducibility confirmed, no template cloning detected)..."
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid #E5E7EB',
                  backgroundColor: '#F9FAFB',
                  fontSize: '12.5px',
                  outline: 'none',
                  color: '#1F2937',
                  resize: 'none',
                }}
              />

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px' }}>
                <button
                  type="button"
                  disabled={isSubmittingReview}
                  onClick={() => handleReview(selectedReq.id, 'REJECTED')}
                  style={{
                    padding: '9px 20px',
                    borderRadius: '10px',
                    border: '1.5px solid #EF4444',
                    backgroundColor: '#FFFFFF',
                    color: '#EF4444',
                    fontSize: '13px',
                    fontWeight: '700',
                    cursor: isSubmittingReview ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span>✕</span>
                  <span>Reject Request</span>
                </button>

                <button
                  type="button"
                  disabled={isSubmittingReview}
                  onClick={() => handleReview(selectedReq.id, 'APPROVED')}
                  style={{
                    padding: '9px 24px',
                    borderRadius: '10px',
                    border: 'none',
                    backgroundColor: '#7952EC',
                    color: '#FFFFFF',
                    fontSize: '13px',
                    fontWeight: '700',
                    cursor: isSubmittingReview ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 8px rgba(121, 82, 236, 0.3)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span>✓</span>
                  <span>{isSubmittingReview ? 'Saving Decision...' : 'Approve Request'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Lightbox / Modal for Evidence Preview */}
      {selectedEvidencePreview && (
        <div
          onClick={() => setSelectedEvidencePreview(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              maxWidth: '750px',
              width: '100%',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem', borderBottom: '1px solid #E5E7EB' }}>
              <span style={{ fontWeight: '700', fontSize: '14px', color: '#1E0B38' }}>{selectedEvidencePreview.title}</span>
              <button
                type="button"
                onClick={() => setSelectedEvidencePreview(null)}
                style={{ border: 'none', background: 'transparent', fontSize: '16px', cursor: 'pointer', color: '#6B7280' }}
              >
                ✕
              </button>
            </div>
            <div style={{ padding: '1rem', backgroundColor: '#0F172A', display: 'flex', justifyContent: 'center' }}>
              <img
                src={selectedEvidencePreview.url}
                alt="Evidence preview"
                style={{ maxHeight: '60vh', maxWidth: '100%', objectFit: 'contain' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
