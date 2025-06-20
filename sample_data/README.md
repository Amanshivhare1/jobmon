# Sample Data Directory

This directory contains the sample data files for the Tidal Dashboard.

## Excel File Template

Create a file named `input.xlsx` in this directory with the following columns:

1. `jobName` (Text): Name of the job
2. `startTime` (DateTime): Job start time
3. `endTime` (DateTime): Job end time
4. `dependency` (Text): Name of the job this job depends on
5. `description` (Text): Job description
6. `priority` (Text): Job priority (high/normal/low)

### Sample Data

| jobName | startTime | endTime | dependency | description | priority |
|---------|-----------|---------|------------|-------------|----------|
| Daily_ETL | 2024-03-20T00:00:00 | 2024-03-20T01:00:00 | | Daily data extraction and transformation | high |
| Data_Validation | 2024-03-20T01:00:00 | 2024-03-20T02:00:00 | Daily_ETL | Validate transformed data | normal |
| Report_Generation | 2024-03-20T02:00:00 | 2024-03-20T03:00:00 | Data_Validation | Generate daily reports | normal |

## File Format

- The Excel file should be in `.xlsx` format
- Dates should be in ISO format (YYYY-MM-DDTHH:mm:ss)
- Empty cells are allowed for optional fields
- The file will be automatically monitored for changes 