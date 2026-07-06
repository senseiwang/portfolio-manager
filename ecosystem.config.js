module.exports = {
  apps: [{
    name: 'portfolio-manager-scheduler',
    script: 'src/cli/schedule.ts',
    interpreter: 'npx',
    interpreter_args: 'tsx',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '500M',
    restart_delay: 5000,
    max_restarts: 10,
    exp_backoff_restart_delay: 10000,
    env: {
      NODE_ENV: 'production',
    },
    error_file: 'logs/scheduler-error.log',
    out_file: 'logs/scheduler-out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    kill_timeout: 10000,
  }],
};
