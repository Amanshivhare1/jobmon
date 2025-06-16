import React, { useState, useEffect, useCallback } from 'react';
import { Search, RefreshCw, Download, Bell, Users, Clock, CheckCircle, XCircle, Play } from 'lucide-react';

const API_BASE_URL = 'http://localhost:3002/api';

// Custom hooks
const useAuth = () => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));

  const login = async (username, password) => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Login failed. Please check your credentials.');
      }
      
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      return true;
    } catch (error) {
      console.error('Login error:', error);
      throw new Error(error.message || 'Failed to connect to the server. Please try again.');
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  // Check for existing session on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
    }
  }, []);

  return { user, token, login, logout };
};

const useApi = (token) => {
  const apiCall = useCallback(async (endpoint, options = {}) => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        // Token expired or invalid
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.reload();
        throw new Error('Session expired. Please login again.');
      }
      throw new Error(`API Error: ${response.statusText}`);
    }
    
    return response.json();
  }, [token]);

  return { apiCall };
};

// Metric Card Component
const MetricCard = ({ title, value, icon: Icon, color = "blue" }) => {
  const colorClasses = {
    blue: "from-blue-500 to-blue-600",
    green: "from-green-500 to-green-600",
    orange: "from-orange-500 to-orange-600",
    red: "from-red-500 to-red-600",
    purple: "from-purple-500 to-purple-600"
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow duration-200">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600 uppercase tracking-wide">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{value}</p>
        </div>
        <div className={`bg-gradient-to-r ${colorClasses[color]} p-3 rounded-full`}>
          <Icon className="h-6 w-6 text-white" />
        </div>
      </div>
    </div>
  );
};

// Job Status Badge Component
const StatusBadge = ({ status }) => {
  const statusConfig = {
    completed: { color: 'bg-green-100 text-green-800', label: 'Completed' },
    running: { color: 'bg-yellow-100 text-yellow-800', label: 'Running' },
    failed: { color: 'bg-red-100 text-red-800', label: 'Failed' },
    delayed: { color: 'bg-purple-100 text-purple-800', label: 'Delayed' }
  };

  const config = statusConfig[status] || statusConfig.failed;

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-medium ${config.color}`}>
      {config.label}
    </span>
  );
};

// Priority Badge Component
const PriorityBadge = ({ priority }) => {
  const priorityConfig = {
    high: { color: 'bg-red-100 text-red-800', label: 'High' },
    normal: { color: 'bg-blue-100 text-blue-800', label: 'Normal' },
    low: { color: 'bg-gray-100 text-gray-800', label: 'Low' }
  };

  const config = priorityConfig[priority] || priorityConfig.normal;

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-medium ${config.color}`}>
      {config.label}
    </span>
  );
};

// Alert Component
const AlertBanner = ({ alerts }) => {
  if (!alerts || alerts.length === 0) return null;

  return (
    <div className="space-y-3 mb-6">
      {alerts.map((alert, index) => (
        <div key={index} className={`p-4 rounded-lg border-l-4 ${
          alert.type === 'error' ? 'bg-red-50 border-red-400 text-red-700' :
          alert.type === 'warning' ? 'bg-yellow-50 border-yellow-400 text-yellow-700' :
          'bg-blue-50 border-blue-400 text-blue-700'
        }`}>
          <div className="flex items-center">
            <Bell className="h-5 w-5 mr-2" />
            <span className="font-medium">{alert.message}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

// Jobs Table Component
const JobsTable = ({ jobs, loading }) => {
  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading jobs...</span>
        </div>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-8">
        <div className="text-center text-gray-500 py-12">
          <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg">No jobs found</p>
          <p className="text-sm">Try adjusting your search criteria</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gradient-to-r from-blue-600 to-purple-600">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-medium text-white uppercase tracking-wider">Job Name</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-white uppercase tracking-wider">Start Time</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-white uppercase tracking-wider">End Time</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-white uppercase tracking-wider">Duration</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-white uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-white uppercase tracking-wider">Priority</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-white uppercase tracking-wider">Dependencies</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {jobs.map((job, index) => (
              <tr key={job.id || index} className="hover:bg-gray-50 transition-colors duration-150">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="font-medium text-gray-900">{job.jobName}</div>
                  {job.description && (
                    <div className="text-sm text-gray-500">{job.description}</div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {job.startTime || 'Not started'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {job.endTime || 'Running...'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {job.duration || 'N/A'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <StatusBadge status={job.status} />
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <PriorityBadge priority={job.priority} />
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {job.dependency || 'None'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Password Reset Request Component
const PasswordResetRequest = ({ onBack }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch(`${API_BASE_URL}/auth/request-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to request password reset');
      }

      setMessage(data.message);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Reset Password</h1>
          <p className="text-gray-600">Enter your email to receive a reset link</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter your email"
              required
            />
          </div>
          
          {error && (
            <div className="text-red-600 text-sm text-center">{error}</div>
          )}
          
          {message && (
            <div className="text-green-600 text-sm text-center">{message}</div>
          )}
          
          <div className="flex flex-col space-y-3">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 px-4 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all duration-200 disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
            
            <button
              type="button"
              onClick={onBack}
              className="w-full text-gray-600 hover:text-gray-800 transition-colors duration-200"
            >
              Back to Login
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Password Reset Form Component
const PasswordResetForm = ({ token, onSuccess }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isValidToken, setIsValidToken] = useState(true);

  useEffect(() => {
    const verifyToken = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/auth/verify-reset-token?token=${token}`);
        const data = await response.json();
        
        if (!response.ok) {
          setIsValidToken(false);
          setError(data.error || 'Invalid or expired reset token');
        }
      } catch (error) {
        setIsValidToken(false);
        setError('Failed to verify reset token');
      }
    };

    verifyToken();
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to reset password');
      }

      onSuccess();
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isValidToken) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-700 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-800 mb-4">Invalid Reset Link</h1>
            <p className="text-red-600 mb-6">{error}</p>
            <button
              onClick={onSuccess}
              className="text-blue-600 hover:text-blue-800 transition-colors duration-200"
            >
              Return to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Set New Password</h1>
          <p className="text-gray-600">Enter your new password below</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter new password"
              required
              minLength={8}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Confirm new password"
              required
              minLength={8}
            />
          </div>
          
          {error && (
            <div className="text-red-600 text-sm text-center">{error}</div>
          )}
          
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 px-4 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all duration-200 disabled:opacity-50"
          >
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>
      </div>
    </div>
  );
};

// Update LoginForm to include reset password link
const LoginForm = ({ onLogin }) => {
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showResetRequest, setShowResetRequest] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      if (!credentials.username || !credentials.password) {
        throw new Error('Please enter both username and password');
      }
      
      await onLogin(credentials.username, credentials.password);
    } catch (error) {
      setError(error.message || 'Invalid credentials');
      console.error('Login submission error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (showResetRequest) {
    return <PasswordResetRequest onBack={() => setShowResetRequest(false)} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Tidal Dashboard</h1>
          <p className="text-gray-600">Please sign in to continue</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Username</label>
            <input
              type="text"
              value={credentials.username}
              onChange={(e) => setCredentials({...credentials, username: e.target.value})}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter username"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
            <input
              type="password"
              value={credentials.password}
              onChange={(e) => setCredentials({...credentials, password: e.target.value})}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter password"
              required
            />
          </div>
          
          {error && (
            <div className="text-red-600 text-sm text-center">{error}</div>
          )}
          
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 px-4 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all duration-200 disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => setShowResetRequest(true)}
              className="text-blue-600 hover:text-blue-800 transition-colors duration-200"
            >
              Forgot Password?
            </button>
          </div>
        </form>
        
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            Demo credentials:<br/>
            <span className="font-mono">admin / Admin@123</span> or <span className="font-mono">viewer / Viewer@123</span>
          </p>
        </div>
      </div>
    </div>
  );
};

// Main Dashboard Component
const Dashboard = ({ user, onLogout, token }) => {
  const [jobs, setJobs] = useState([]);
  const [metrics, setMetrics] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [dataSource, setDataSource] = useState('excel');
  const [showDataSourceModal, setShowDataSourceModal] = useState(false);
  
  const { apiCall } = useApi(token);

  // Add data source configuration fetch
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const config = await apiCall('/config');
        setDataSource(config.dataSource);
      } catch (error) {
        console.error('Error fetching configuration:', error);
      }
    };
    fetchConfig();
  }, [apiCall]);

  // Add data source switcher
  const handleDataSourceChange = async (newSource) => {
    try {
      await apiCall('/config/source', {
        method: 'POST',
        body: JSON.stringify({ source: newSource })
      });
      setDataSource(newSource);
      setShowDataSourceModal(false);
      // Refresh data after switching source
      await refreshData();
    } catch (error) {
      console.error('Error switching data source:', error);
    }
  };

  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (priorityFilter !== 'all') params.append('priority', priorityFilter);
      
      const jobsData = await apiCall(`/jobs?${params}`);
      setJobs(jobsData.jobs);
      setLastUpdated(new Date(jobsData.lastUpdated));
    } catch (error) {
      console.error('Error fetching jobs:', error);
    } finally {
      setLoading(false);
    }
  }, [apiCall, searchTerm, statusFilter, priorityFilter]);

  const fetchMetrics = useCallback(async () => {
    try {
      const metricsData = await apiCall('/jobs/metrics');
      setMetrics(metricsData);
    } catch (error) {
      console.error('Error fetching metrics:', error);
    }
  }, [apiCall]);

  const fetchAlerts = useCallback(async () => {
    try {
      const alertsData = await apiCall('/alerts');
      setAlerts(alertsData.alerts);
    } catch (error) {
      console.error('Error fetching alerts:', error);
    }
  }, [apiCall]);

  const refreshData = async () => {
    try {
      await apiCall('/jobs/refresh', { method: 'POST' });
      await fetchJobs();
      await fetchMetrics();
      await fetchAlerts();
    } catch (error) {
      console.error('Error refreshing data:', error);
    }
  };

  const exportData = async () => {
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (priorityFilter !== 'all') params.append('priority', priorityFilter);
      
      const response = await fetch(`${API_BASE_URL}/jobs/export?${params}`);
      
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tidal_jobs_export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting data:', error);
    }
  };

  // Initial data fetch
  useEffect(() => {
    fetchJobs();
    fetchMetrics();
    fetchAlerts();
  }, [fetchJobs, fetchMetrics, fetchAlerts]);

  // Auto-refresh effect
  useEffect(() => {
    let interval;
    if (autoRefresh) {
      interval = setInterval(() => {
        fetchJobs();
        fetchMetrics();
        fetchAlerts();
      }, 300000); // 5 minutes
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, fetchJobs, fetchMetrics, fetchAlerts]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
      {/* Header */}
      <header className="bg-white shadow-lg border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                🚀 Tidal Dashboard
              </h1>
              <p className="text-gray-600 mt-1">Real-time job execution monitoring</p>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">Welcome, {user.username}</span>
              {user.role === 'admin' && (
                <button
                  onClick={() => setShowDataSourceModal(true)}
                  className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-lg transition-colors duration-200"
                >
                  Data Source: {dataSource}
                </button>
              )}
              <button
                onClick={onLogout}
                className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition-colors duration-200"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Data Source Modal */}
      {showDataSourceModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Select Data Source</h2>
            <div className="space-y-4">
              <button
                onClick={() => handleDataSourceChange('excel')}
                className={`w-full p-4 rounded-lg border-2 transition-colors duration-200 ${
                  dataSource === 'excel'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-blue-500'
                }`}
              >
                <h3 className="font-semibold text-gray-800">Excel File</h3>
                <p className="text-sm text-gray-600">Read job data from Excel file</p>
              </button>
              <button
                onClick={() => handleDataSourceChange('database')}
                className={`w-full p-4 rounded-lg border-2 transition-colors duration-200 ${
                  dataSource === 'database'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-blue-500'
                }`}
              >
                <h3 className="font-semibold text-gray-800">Database</h3>
                <p className="text-sm text-gray-600">Read job data directly from database</p>
              </button>
            </div>
            <button
              onClick={() => setShowDataSourceModal(false)}
              className="mt-6 w-full bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg transition-colors duration-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Controls */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
          <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-4 flex-1">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <input
                  type="text"
                  placeholder="Search jobs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Status</option>
                <option value="completed">Completed</option>
                <option value="running">Running</option>
                <option value="failed">Failed</option>
                <option value="delayed">Delayed</option>
              </select>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Priorities</option>
                <option value="high">High</option>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
              </select>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={refreshData}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </button>
              <button
                onClick={exportData}
                className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors duration-200"
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </button>
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`flex items-center px-4 py-2 rounded-lg transition-colors duration-200 ${
                  autoRefresh 
                    ? 'bg-orange-600 text-white hover:bg-orange-700' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                <Clock className="h-4 w-4 mr-2" />
                Auto-refresh: {autoRefresh ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          <MetricCard
            title="Total Jobs"
            value={metrics.total || 0}
            icon={Users}
            color="blue"
          />
          <MetricCard
            title="Completed"
            value={metrics.completed || 0}
            icon={CheckCircle}
            color="green"
          />
          <MetricCard
            title="Running"
            value={metrics.running || 0}
            icon={Play}
            color="orange"
          />
          <MetricCard
            title="Failed"
            value={metrics.failed || 0}
            icon={XCircle}
            color="red"
          />
          <MetricCard
            title="Avg Runtime"
            value={`${metrics.avgRunTimeMinutes || 0}m`}
            icon={Clock}
            color="purple"
          />
        </div>

        {/* Alerts */}
        <AlertBanner alerts={alerts} />

        {/* Jobs Table */}
        <JobsTable jobs={jobs} loading={loading} />
        
        {/* Footer */}
        <div className="mt-8 text-center text-gray-500">
          {lastUpdated && (
            <p className="text-sm">
              Last updated: {lastUpdated.toLocaleString()}
            </p>
          )}
          {autoRefresh && (
            <p className="text-xs mt-1">
              Auto-refresh enabled - Updates every 5 minutes
            </p>
          )}
          <p className="text-xs mt-1">
            Data Source: {dataSource}
          </p>
        </div>
      </div>
    </div>
  );
};

// Main App Component
const TidalDashboard = () => {
  const { user, token, login, logout } = useAuth();

  if (!token || !user) {
    return <LoginForm onLogin={login} />;
  }

  return <Dashboard user={user} onLogout={logout} token={token} />;
};

export default TidalDashboard;