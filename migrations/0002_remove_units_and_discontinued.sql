UPDATE producto
SET estado_id = (SELECT id FROM estado WHERE nombre = 'inactivo')
WHERE estado_id = (SELECT id FROM estado WHERE nombre = 'descontinuado');

ALTER TABLE producto DROP COLUMN unidad_medida_id;
DROP TABLE unidad_medida;
DELETE FROM estado WHERE nombre = 'descontinuado';
