-- Create the database if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'TidalJobs')
BEGIN
    CREATE DATABASE TidalJobs;
END
GO

USE TidalJobs;
GO

-- Create the jobs table if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'jobs')
BEGIN
    CREATE TABLE jobs (
        id INT IDENTITY(1,1) PRIMARY KEY,
        job_name NVARCHAR(255) NOT NULL,
        start_time DATETIME2,
        end_time DATETIME2,
        dependency NVARCHAR(255),
        description NVARCHAR(MAX),
        priority NVARCHAR(50) DEFAULT 'normal',
        status NVARCHAR(50) DEFAULT 'pending',
        created_at DATETIME2 DEFAULT GETDATE(),
        updated_at DATETIME2 DEFAULT GETDATE(),
        -- Add computed columns for common queries
        duration_minutes AS DATEDIFF(MINUTE, start_time, end_time),
        is_active AS CASE WHEN end_time IS NULL THEN 1 ELSE 0 END
    );
END
GO

-- Create indexes for common query patterns
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_jobs_job_name' AND object_id = OBJECT_ID('jobs'))
BEGIN
    CREATE INDEX IX_jobs_job_name ON jobs(job_name);
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_jobs_status' AND object_id = OBJECT_ID('jobs'))
BEGIN
    CREATE INDEX IX_jobs_status ON jobs(status);
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_jobs_priority' AND object_id = OBJECT_ID('jobs'))
BEGIN
    CREATE INDEX IX_jobs_priority ON jobs(priority);
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_jobs_start_time' AND object_id = OBJECT_ID('jobs'))
BEGIN
    CREATE INDEX IX_jobs_start_time ON jobs(start_time);
END
GO

-- Create a trigger to update the updated_at timestamp
IF NOT EXISTS (SELECT * FROM sys.triggers WHERE name = 'TR_jobs_update_timestamp')
BEGIN
    CREATE TRIGGER TR_jobs_update_timestamp
    ON jobs
    AFTER UPDATE
    AS
    BEGIN
        UPDATE jobs
        SET updated_at = GETDATE()
        FROM jobs t
        INNER JOIN inserted i ON t.id = i.id;
    END
END
GO

-- Create a view for job metrics
IF EXISTS (SELECT * FROM sys.views WHERE name = 'vw_job_metrics')
BEGIN
    DROP VIEW vw_job_metrics;
END
GO

CREATE VIEW vw_job_metrics AS
SELECT 
    COUNT(*) as total_jobs,
    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_jobs,
    SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running_jobs,
    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_jobs,
    SUM(CASE WHEN status = 'delayed' THEN 1 ELSE 0 END) as delayed_jobs,
    AVG(CAST(duration_minutes as FLOAT)) as avg_duration_minutes,
    SUM(CASE WHEN priority = 'high' THEN 1 ELSE 0 END) as high_priority_jobs,
    SUM(CASE WHEN priority = 'normal' THEN 1 ELSE 0 END) as normal_priority_jobs,
    SUM(CASE WHEN priority = 'low' THEN 1 ELSE 0 END) as low_priority_jobs
FROM jobs;
GO

-- Create a stored procedure for efficient job retrieval with pagination
IF EXISTS (SELECT * FROM sys.procedures WHERE name = 'sp_GetJobs')
BEGIN
    DROP PROCEDURE sp_GetJobs;
END
GO

CREATE PROCEDURE sp_GetJobs
    @PageSize INT = 50,
    @PageNumber INT = 1,
    @SearchTerm NVARCHAR(255) = NULL,
    @Status NVARCHAR(50) = NULL,
    @Priority NVARCHAR(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @Offset INT = (@PageNumber - 1) * @PageSize;
    
    -- Get total count for pagination
    SELECT COUNT(*) as total_count
    FROM jobs
    WHERE (@SearchTerm IS NULL OR 
           job_name LIKE '%' + @SearchTerm + '%' OR 
           description LIKE '%' + @SearchTerm + '%' OR
           dependency LIKE '%' + @SearchTerm + '%')
    AND (@Status IS NULL OR status = @Status)
    AND (@Priority IS NULL OR priority = @Priority);
    
    -- Get paginated results
    SELECT 
        id,
        job_name,
        start_time,
        end_time,
        dependency,
        description,
        priority,
        status,
        created_at,
        updated_at,
        duration_minutes
    FROM jobs
    WHERE (@SearchTerm IS NULL OR 
           job_name LIKE '%' + @SearchTerm + '%' OR 
           description LIKE '%' + @SearchTerm + '%' OR
           dependency LIKE '%' + @SearchTerm + '%')
    AND (@Status IS NULL OR status = @Status)
    AND (@Priority IS NULL OR priority = @Priority)
    ORDER BY start_time DESC
    OFFSET @Offset ROWS
    FETCH NEXT @PageSize ROWS ONLY;
END
GO

-- Insert sample data (3000 jobs)
IF NOT EXISTS (SELECT * FROM jobs)
BEGIN
    DECLARE @i INT = 1;
    DECLARE @start_time DATETIME2 = DATEADD(DAY, -30, GETDATE());
    
    WHILE @i <= 3000
    BEGIN
        INSERT INTO jobs (
            job_name,
            start_time,
            end_time,
            dependency,
            description,
            priority,
            status
        )
        VALUES (
            'Job_' + CAST(@i AS NVARCHAR(10)),
            DATEADD(MINUTE, @i * 5, @start_time),
            CASE 
                WHEN @i % 10 = 0 THEN NULL -- 10% of jobs are running
                ELSE DATEADD(MINUTE, @i * 5 + 30, @start_time)
            END,
            CASE 
                WHEN @i % 3 = 0 THEN 'Job_' + CAST(@i - 1 AS NVARCHAR(10))
                ELSE NULL
            END,
            'Description for Job ' + CAST(@i AS NVARCHAR(10)),
            CASE 
                WHEN @i % 5 = 0 THEN 'high'
                WHEN @i % 3 = 0 THEN 'low'
                ELSE 'normal'
            END,
            CASE 
                WHEN @i % 10 = 0 THEN 'running'
                WHEN @i % 20 = 0 THEN 'failed'
                WHEN @i % 15 = 0 THEN 'delayed'
                ELSE 'completed'
            END
        );
        
        SET @i = @i + 1;
    END
END
GO 