'use strict';

const express = require('express');
const { getSupabase } = require('../lib/supabase');
const { uuid } = require('../lib/validation');

const router = express.Router();

/** GET /api/jobs/:job_id → generation job status */
router.get('/:job_id', async (req, res, next) => {
  try {
    const jobId = uuid(req.params.job_id, 'job_id');
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('generation_jobs')
      .select('id,status,progress,stage,world_id,error')
      .eq('id', jobId)
      .single();
    if (error || !data) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json({
      status: data.status,
      progress: data.progress,
      stage: data.stage,
      ...(data.world_id ? { world_id: data.world_id } : {}),
      ...(data.error ? { error: data.error } : {}),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
