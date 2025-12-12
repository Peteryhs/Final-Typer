import React from 'react';
import { Box, IconButton, Typography, useTheme } from '@mui/material';
import { Remove, CropSquare, Close } from '@mui/icons-material';

const TitleBar: React.FC = () => {
  const theme = useTheme();

  const handleMinimize = () => window.electronAPI.minimize();
  const handleMaximize = () => window.electronAPI.maximize();
  const handleClose = () => window.electronAPI.close();

  return (
    <Box
      sx={{
        height: 32, // Standard title bar height
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        bgcolor: 'background.paper', // Matches the app background or sidebar
        color: 'text.secondary',
        WebkitAppRegion: 'drag', // Make draggable
        userSelect: 'none',
        px: 1,
        borderBottom: `1px solid ${theme.palette.divider}`,
        zIndex: 9999, // Ensure it's on top
      }}
    >
      {/* Title / Logo Area */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1 }}>
         <Typography variant="caption" fontWeight={700} sx={{ fontSize: '0.75rem' }}>
            FINAL TYPER
         </Typography>
      </Box>

      {/* Window Controls */}
      <Box sx={{ display: 'flex', WebkitAppRegion: 'no-drag' }}>
        <IconButton 
          size="small" 
          onClick={handleMinimize}
          sx={{ 
             width: 40, height: 32, borderRadius: 0,
             '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' } 
          }}
        >
          <Remove sx={{ fontSize: 18 }} />
        </IconButton>

        <IconButton 
          size="small" 
          onClick={handleMaximize}
          sx={{ 
             width: 40, height: 32, borderRadius: 0,
             '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' } 
          }}
        >
          <CropSquare sx={{ fontSize: 16 }} />
        </IconButton>

        <IconButton 
          size="small" 
          onClick={handleClose}
          sx={{ 
             width: 40, height: 32, borderRadius: 0,
             '&:hover': { bgcolor: 'error.main', color: 'error.contrastText' } 
          }}
        >
          <Close sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>
    </Box>
  );
};

export default TitleBar;
