from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from datetime import datetime, timedelta
import pandas as pd
import os
import bcrypt
import json
from dotenv import load_dotenv
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app)

# Configuration
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'your-secret-key-here')
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'jwt-secret-key-here')
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(hours=24)

# Data source configuration
EXCEL_FILE_PATH = os.path.join('sample_data', 'input.xlsx')

# In-memory user store (you can extend this to use a simple JSON file)
users = [
    {
        'id': 1,
        'username': 'admin',
        'password': bcrypt.hashpw('Admin@123'.encode('utf-8'), bcrypt.gensalt()).decode('utf-8'),
        'role': 'admin',
        'email': 'admin@example.com',
        'full_name': 'System Administrator'
    },
    {
        'id': 2,
        'username': 'viewer',
        'password': bcrypt.hashpw('Viewer@123'.encode('utf-8'), bcrypt.gensalt()).decode('utf-8'),
        'role': 'viewer',
        'email': 'viewer@example.com',
        'full_name': 'System Viewer'
    }
]

# Initialize JWT
jwt = JWTManager(app)

# Global variables
jobs_data = []
last_updated = None

# Utility functions
def load_jobs_from_excel():
    """Load jobs data from Excel file"""
    global jobs_data, last_updated
    try:
        if not os.path.exists(EXCEL_FILE_PATH):
            print(f"Excel file not found at {EXCEL_FILE_PATH}")
            jobs_data = []
            last_updated = datetime.now()
            return
        
        df = pd.read_excel(EXCEL_FILE_PATH)
        jobs = []
        
        for index, row in df.iterrows():
            job = {
                'id': f"{row['jobName']}_{index}_{datetime.now().timestamp()}",
                'jobName': str(row['jobName']).strip() if pd.notna(row['jobName']) else '',
                'startTime': str(row['startTime']).strip() if pd.notna(row['startTime']) else '',
                'endTime': str(row['endTime']).strip() if pd.notna(row['endTime']) else '',
                'dependency': str(row['dependency']).strip() if pd.notna(row['dependency']) else '',
                'description': str(row['description']).strip() if pd.notna(row['description']) else '',
                'priority': str(row['priority']).strip() if pd.notna(row['priority']) else 'normal'
            }
            jobs.append(process_job_data(job))
        
        jobs_data = jobs
        last_updated = datetime.now()
        print(f"Loaded {len(jobs)} jobs from Excel file")
        
    except Exception as e:
        print(f"Error loading Excel file: {str(e)}")
        jobs_data = []
        last_updated = datetime.now()

def process_job_data(job):
    """Process job data and calculate derived fields"""
    start_time = parse_datetime(job['startTime'])
    end_time = parse_datetime(job['endTime'])
    
    job['status'] = determine_status(start_time, end_time)
    job['duration'] = calculate_duration(start_time, end_time)
    job['startTimeParsed'] = start_time
    job['endTimeParsed'] = end_time
    
    return job

def parse_datetime(datetime_str):
    """Parse datetime string to datetime object"""
    if not datetime_str or datetime_str.strip() == '':
        return None
    try:
        # Try different datetime formats
        formats = [
            '%Y-%m-%dT%H:%M:%S',
            '%Y-%m-%d %H:%M:%S',
            '%Y-%m-%d',
            '%m/%d/%Y %H:%M:%S',
            '%m/%d/%Y'
        ]
        
        for fmt in formats:
            try:
                return datetime.strptime(datetime_str.strip(), fmt)
            except ValueError:
                continue
        
        # If none of the formats work, try pandas parsing
        return pd.to_datetime(datetime_str.strip())
        
    except Exception as e:
        print(f"Error parsing datetime '{datetime_str}': {str(e)}")
        return None

def calculate_duration(start_time, end_time):
    """Calculate duration between start and end times"""
    if not start_time:
        return None
    if not end_time:
        return 'Running'
    
    try:
        duration = end_time - start_time
        if duration.total_seconds() < 0:
            return 'Invalid'
        
        minutes = int(duration.total_seconds() / 60)
        hours = minutes // 60
        
        if hours > 0:
            return f"{hours}h {minutes % 60}m"
        return f"{minutes}m"
    except Exception as e:
        print(f"Error calculating duration: {str(e)}")
        return 'Invalid'

def determine_status(start_time, end_time):
    """Determine job status based on start and end times"""
    if not start_time:
        return 'failed'
    if not end_time:
        return 'running'
    
    try:
        duration = end_time - start_time
        if duration.total_seconds() > 2 * 60 * 60:  # 2 hours
            return 'delayed'
        return 'completed'
    except Exception as e:
        print(f"Error determining status: {str(e)}")
        return 'failed'

def get_user_by_username(username):
    """Get user by username"""
    return next((user for user in users if user['username'] == username), None)

# File watcher for Excel updates
class ExcelFileHandler(FileSystemEventHandler):
    def on_modified(self, event):
        if event.src_path.endswith('input.xlsx'):
            print("Excel file changed, reloading data...")
            load_jobs_from_excel()

# Initialize file watcher
observer = Observer()
observer.schedule(ExcelFileHandler(), path=os.path.dirname(EXCEL_FILE_PATH), recursive=False)
observer.start()

# Load initial data
load_jobs_from_excel()

# Routes
@app.route('/api/auth/login', methods=['POST'])
def login():
    """Handle user login"""
    try:
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        
        if not username or not password:
            return jsonify({'error': 'Username and password are required'}), 400
        
        user = get_user_by_username(username)
        if not user or not bcrypt.checkpw(password.encode('utf-8'), user['password'].encode('utf-8')):
            return jsonify({'error': 'Invalid username or password'}), 401
        
        access_token = create_access_token(identity={
            'id': user['id'],
            'username': user['username'],
            'role': user['role']
        })
        
        return jsonify({
            'token': access_token,
            'user': {
                'id': user['id'],
                'username': user['username'],
                'role': user['role']
            }
        })
    except Exception as e:
        print(f"Login error: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/jobs', methods=['GET'])
@jwt_required()
def get_jobs():
    """Get jobs with filtering and pagination"""
    try:
        search = request.args.get('search')
        status = request.args.get('status')
        priority = request.args.get('priority')
        page = int(request.args.get('page', 1))
        page_size = int(request.args.get('pageSize', 50))
        
        filtered_jobs = jobs_data.copy()
        
        # Apply search filter
        if search:
            search_term = search.lower()
            filtered_jobs = [job for job in filtered_jobs if
                search_term in job['jobName'].lower() or
                search_term in job['dependency'].lower() or
                (job['description'] and search_term in job['description'].lower())
            ]
        
        # Apply status filter
        if status and status != 'all':
            filtered_jobs = [job for job in filtered_jobs if job['status'] == status]
        
        # Apply priority filter
        if priority and priority != 'all':
            filtered_jobs = [job for job in filtered_jobs if job['priority'] == priority]
        
        # Apply pagination
        total_count = len(filtered_jobs)
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        paginated_jobs = filtered_jobs[start_idx:end_idx]
        
        return jsonify({
            'jobs': paginated_jobs,
            'totalCount': total_count,
            'lastUpdated': last_updated.isoformat() if last_updated else None,
            'dataSource': 'excel'
        })
    except Exception as e:
        print(f"Error fetching jobs: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/jobs/metrics', methods=['GET'])
@jwt_required()
def get_metrics():
    """Get job metrics"""
    try:
        total = len(jobs_data)
        completed = sum(1 for job in jobs_data if job['status'] == 'completed')
        running = sum(1 for job in jobs_data if job['status'] == 'running')
        failed = sum(1 for job in jobs_data if job['status'] == 'failed')
        delayed = sum(1 for job in jobs_data if job['status'] == 'delayed')
        
        high_priority = sum(1 for job in jobs_data if job['priority'] == 'high')
        normal_priority = sum(1 for job in jobs_data if job['priority'] == 'normal')
        low_priority = sum(1 for job in jobs_data if job['priority'] == 'low')
        
        # Calculate average duration
        completed_jobs = [
            job for job in jobs_data
            if job['status'] == 'completed' and
            job['startTimeParsed'] and
            job['endTimeParsed']
        ]
        
        avg_duration = 0
        if completed_jobs:
            total_duration = sum(
                (job['endTimeParsed'] - job['startTimeParsed']).total_seconds()
                for job in completed_jobs
            )
            avg_duration = total_duration / len(completed_jobs) / 60  # Convert to minutes
        
        return jsonify({
            'total': total,
            'completed': completed,
            'running': running,
            'failed': failed,
            'delayed': delayed,
            'avgRunTimeMinutes': int(avg_duration),
            'priorityDistribution': {
                'high': high_priority,
                'normal': normal_priority,
                'low': low_priority
            },
            'lastUpdated': last_updated.isoformat() if last_updated else None
        })
    except Exception as e:
        print(f"Error fetching metrics: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/jobs/refresh', methods=['POST'])
@jwt_required()
def refresh_data():
    """Force refresh data from Excel file"""
    try:
        load_jobs_from_excel()
        return jsonify({
            'message': 'Data refreshed successfully',
            'count': len(jobs_data),
            'lastUpdated': last_updated.isoformat() if last_updated else None
        })
    except Exception as e:
        print(f"Error refreshing data: {str(e)}")
        return jsonify({'error': 'Failed to refresh data'}), 500

@app.route('/api/jobs/export', methods=['GET'])
@jwt_required()
def export_jobs():
    """Export jobs data as CSV"""
    try:
        search = request.args.get('search')
        status = request.args.get('status')
        priority = request.args.get('priority')
        
        filtered_jobs = jobs_data.copy()
        
        # Apply filters
        if search:
            search_term = search.lower()
            filtered_jobs = [job for job in filtered_jobs if
                search_term in job['jobName'].lower() or
                search_term in job['dependency'].lower() or
                (job['description'] and search_term in job['description'].lower())
            ]
        
        if status and status != 'all':
            filtered_jobs = [job for job in filtered_jobs if job['status'] == status]
        
        if priority and priority != 'all':
            filtered_jobs = [job for job in filtered_jobs if job['priority'] == priority]
        
        # Create CSV data
        csv_data = []
        for job in filtered_jobs:
            csv_data.append({
                'Job Name': job['jobName'],
                'Start Time': job['startTime'],
                'End Time': job['endTime'],
                'Duration': job['duration'],
                'Status': job['status'],
                'Dependencies': job['dependency'],
                'Priority': job['priority'],
                'Description': job['description'] or ''
            })
        
        # Convert to DataFrame and export
        df = pd.DataFrame(csv_data)
        csv_content = df.to_csv(index=False)
        
        from flask import Response
        return Response(
            csv_content,
            mimetype='text/csv',
            headers={'Content-Disposition': f'attachment; filename=tidal_jobs_export_{datetime.now().strftime("%Y%m%d")}.csv'}
        )
    except Exception as e:
        print(f"Error exporting data: {str(e)}")
        return jsonify({'error': 'Failed to export data'}), 500

@app.route('/api/alerts', methods=['GET'])
@jwt_required()
def get_alerts():
    """Get alerts for critical jobs"""
    try:
        alerts = []
        
        delayed_jobs = [job for job in jobs_data if job['status'] == 'delayed']
        failed_jobs = [job for job in jobs_data if job['status'] == 'failed']
        
        # Find long-running jobs (more than 3 hours)
        long_running_jobs = []
        for job in jobs_data:
            if job['status'] == 'running' and job['startTimeParsed']:
                now = datetime.now()
                running_time = now - job['startTimeParsed']
                if running_time.total_seconds() > 3 * 60 * 60:  # 3 hours
                    long_running_jobs.append(job)
        
        if delayed_jobs:
            alerts.append({
                'type': 'warning',
                'message': f'{len(delayed_jobs)} job(s) are running longer than expected',
                'jobs': [job['jobName'] for job in delayed_jobs],
                'severity': 'medium'
            })
        
        if failed_jobs:
            alerts.append({
                'type': 'error',
                'message': f'{len(failed_jobs)} job(s) have failed to start',
                'jobs': [job['jobName'] for job in failed_jobs],
                'severity': 'high'
            })
        
        if long_running_jobs:
            alerts.append({
                'type': 'info',
                'message': f'{len(long_running_jobs)} job(s) have been running for more than 3 hours',
                'jobs': [job['jobName'] for job in long_running_jobs],
                'severity': 'low'
            })
        
        return jsonify({'alerts': alerts, 'timestamp': datetime.now().isoformat()})
    except Exception as e:
        print(f"Error fetching alerts: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/config', methods=['GET'])
def get_config():
    """Get application configuration"""
    return jsonify({
        'dataSource': 'excel',
        'excel': {
            'path': EXCEL_FILE_PATH,
            'exists': os.path.exists(EXCEL_FILE_PATH)
        }
    })

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'jobsCount': len(jobs_data),
        'lastUpdated': last_updated.isoformat() if last_updated else None,
        'excelPath': EXCEL_FILE_PATH,
        'excelExists': os.path.exists(EXCEL_FILE_PATH)
    })

if __name__ == '__main__':
    print("🚀 Starting Tidal Dashboard Flask Server...")
    print(f"📁 Monitoring Excel file: {EXCEL_FILE_PATH}")
    print(f"📊 Loaded {len(jobs_data)} jobs")
    print("🌐 Server will be available at: http://localhost:5000")
    app.run(debug=True, port=5000, host='0.0.0.0') 