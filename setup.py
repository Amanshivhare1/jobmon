#!/usr/bin/env python3
"""
Setup script for Tidal Dashboard
This script helps set up the application on Windows systems.
"""

import os
import sys
import subprocess
import shutil

def check_python_version():
    """Check if Python version is compatible"""
    if sys.version_info < (3, 8):
        print("❌ Error: Python 3.8 or higher is required")
        print(f"Current version: {sys.version}")
        return False
    print(f"✅ Python version: {sys.version}")
    return True

def create_directories():
    """Create necessary directories"""
    directories = ['sample_data', 'logs']
    for directory in directories:
        if not os.path.exists(directory):
            os.makedirs(directory)
            print(f"✅ Created directory: {directory}")
        else:
            print(f"📁 Directory exists: {directory}")

def install_requirements():
    """Install required packages"""
    try:
        print("📦 Installing required packages...")
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-r', 'requirements.txt'])
        print("✅ Packages installed successfully")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Error installing packages: {e}")
        return False

def create_env_file():
    """Create .env file if it doesn't exist"""
    env_file = '.env'
    if not os.path.exists(env_file):
        env_content = """# Flask Configuration
FLASK_APP=app.py
FLASK_ENV=development
SECRET_KEY=your-secret-key-change-this-in-production
JWT_SECRET_KEY=your-jwt-secret-key-change-this-in-production

# Data Source Configuration
DATA_SOURCE=excel
"""
        with open(env_file, 'w') as f:
            f.write(env_content)
        print("✅ Created .env file")
    else:
        print("📄 .env file already exists")

def create_sample_excel():
    """Create sample Excel file if it doesn't exist"""
    excel_file = os.path.join('sample_data', 'input.xlsx')
    if not os.path.exists(excel_file):
        try:
            import pandas as pd
            
            # Sample data
            sample_data = {
                'jobName': [
                    'Daily_ETL',
                    'Data_Validation', 
                    'Report_Generation',
                    'Data_Cleanup',
                    'Backup_Process'
                ],
                'startTime': [
                    '2024-03-20T00:00:00',
                    '2024-03-20T01:00:00',
                    '2024-03-20T02:00:00',
                    '2024-03-20T03:00:00',
                    '2024-03-20T04:00:00'
                ],
                'endTime': [
                    '2024-03-20T01:00:00',
                    '2024-03-20T02:00:00',
                    '2024-03-20T03:00:00',
                    '2024-03-20T04:00:00',
                    '2024-03-20T05:00:00'
                ],
                'dependency': [
                    '',
                    'Daily_ETL',
                    'Data_Validation',
                    'Report_Generation',
                    'Data_Cleanup'
                ],
                'description': [
                    'Daily data extraction and transformation',
                    'Validate transformed data',
                    'Generate daily reports',
                    'Clean up temporary files',
                    'Create backup of processed data'
                ],
                'priority': [
                    'high',
                    'normal',
                    'normal',
                    'low',
                    'high'
                ]
            }
            
            df = pd.DataFrame(sample_data)
            df.to_excel(excel_file, index=False)
            print("✅ Created sample Excel file")
        except Exception as e:
            print(f"❌ Error creating sample Excel file: {e}")
    else:
        print("📊 Sample Excel file already exists")

def main():
    """Main setup function"""
    print("🚀 Setting up Tidal Dashboard...")
    print("=" * 50)
    
    # Check Python version
    if not check_python_version():
        return False
    
    # Create directories
    create_directories()
    
    # Install requirements
    if not install_requirements():
        return False
    
    # Create .env file
    create_env_file()
    
    # Create sample Excel file
    create_sample_excel()
    
    print("\n" + "=" * 50)
    print("✅ Setup completed successfully!")
    print("\n📋 Next steps:")
    print("1. Start the server: python app.py")
    print("2. Open your browser: http://localhost:5000")
    print("3. Login with:")
    print("   - Admin: username=admin, password=Admin@123")
    print("   - Viewer: username=viewer, password=Viewer@123")
    print("\n📁 Excel file location: sample_data/input.xlsx")
    print("📝 Update the Excel file to see changes in real-time")
    
    return True

if __name__ == '__main__':
    success = main()
    if not success:
        sys.exit(1) 